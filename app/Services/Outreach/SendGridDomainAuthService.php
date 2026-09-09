<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

/**
 * Wraps SendGrid's Domain Authentication ("whitelabel") API so an organization
 * can prove ownership of their own sending domain. All email still sends through
 * our single SendGrid account/API key — this only changes which domain a
 * verified organization is allowed to send "From".
 */
class SendGridDomainAuthService
{
    private const API_BASE = 'https://api.sendgrid.com/v3';

    public function authenticate(Organization $organization, string $domain, string $fromEmail): OutreachDomainAuthentication
    {
        $domain = $this->normalizeDomain($domain);
        $this->assertEmailMatchesDomain($fromEmail, $domain);

        $existing = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        // Re-auth on the same domain: reuse the SendGrid whitelabel and refresh DNS
        // instead of creating orphan remote domains on every "Generate" click.
        if ($existing && $existing->domain === $domain && filled($existing->sendgrid_domain_id)) {
            return $this->refreshExistingDomain($existing, $organization, $fromEmail);
        }

        // If switching domains, clean up the previous SendGrid-side record first.
        if ($existing && $existing->domain !== $domain && $existing->sendgrid_domain_id) {
            $this->deleteRemote($existing->sendgrid_domain_id);
        }

        $response = $this->client()->post(self::API_BASE.'/whitelabel/domains', [
            'domain' => $domain,
            'automatic_security' => true,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('SendGrid domain authentication failed: '.$response->body());
        }

        $payload = $response->json();
        $dnsRecords = $this->extractDnsRecords($payload['dns'] ?? []);

        return OutreachDomainAuthentication::query()->updateOrCreate(
            ['organization_id' => $organization->id],
            [
                'domain' => $domain,
                'subdomain' => $payload['subdomain'] ?? null,
                'sendgrid_domain_id' => (string) ($payload['id'] ?? ''),
                'from_email' => $fromEmail,
                'from_name' => $organization->name,
                'dns_records' => $dnsRecords,
                'valid' => (bool) ($payload['valid'] ?? false),
                'verification_status' => 'pending',
                'verified_at' => null,
                'last_checked_at' => now(),
            ]
        );
    }

    private function refreshExistingDomain(
        OutreachDomainAuthentication $existing,
        Organization $organization,
        string $fromEmail,
    ): OutreachDomainAuthentication {
        $response = $this->client()->get(
            self::API_BASE.'/whitelabel/domains/'.$existing->sendgrid_domain_id
        );

        if ($response->successful()) {
            $payload = $response->json();
            $dnsRecords = $this->extractDnsRecords($payload['dns'] ?? []);
            $valid = (bool) ($payload['valid'] ?? false);

            $existing->update([
                'from_email' => $fromEmail,
                'from_name' => $organization->name,
                'subdomain' => $payload['subdomain'] ?? $existing->subdomain,
                'dns_records' => $dnsRecords !== [] ? $dnsRecords : $existing->dns_records,
                'valid' => $valid,
                // Keep verified if SendGrid still reports valid; otherwise stay pending/failed.
                'verification_status' => $valid
                    ? 'verified'
                    : ($existing->verification_status === 'verified' ? 'pending' : ($existing->verification_status ?: 'pending')),
                'verified_at' => $valid ? ($existing->verified_at ?? now()) : null,
                'last_checked_at' => now(),
            ]);

            return $existing->refresh();
        }

        // Remote lookup failed — still allow updating the from-email locally.
        $existing->update([
            'from_email' => $fromEmail,
            'from_name' => $organization->name,
            'last_checked_at' => now(),
        ]);

        return $existing->refresh();
    }

    public function verify(Organization $organization): OutreachDomainAuthentication
    {
        $record = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $record || ! $record->sendgrid_domain_id) {
            throw new InvalidArgumentException('No domain authentication has been started for this organization.');
        }

        $response = $this->client()->post(
            self::API_BASE."/whitelabel/domains/{$record->sendgrid_domain_id}/validate"
        );

        if (! $response->successful()) {
            throw new RuntimeException('SendGrid domain validation request failed: '.$response->body());
        }

        $payload = $response->json();
        $valid = (bool) ($payload['valid'] ?? false);

        // Validation response nests per-record results under validation_results.
        $dnsRecords = $this->extractDnsRecords($payload['validation_results'] ?? $record->dns_records ?? []);

        $record->update([
            'dns_records' => $dnsRecords ?: $record->dns_records,
            'valid' => $valid,
            'verification_status' => $valid ? 'verified' : 'failed',
            'verified_at' => $valid ? now() : $record->verified_at,
            'last_checked_at' => now(),
        ]);

        return $record->refresh();
    }

    public function current(Organization $organization): ?OutreachDomainAuthentication
    {
        return OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();
    }

    public function reset(Organization $organization): void
    {
        $record = OutreachDomainAuthentication::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $record) {
            return;
        }

        if ($record->sendgrid_domain_id) {
            $this->deleteRemote($record->sendgrid_domain_id);
        }

        $record->delete();
    }

    private function deleteRemote(string $sendgridDomainId): void
    {
        try {
            $this->client()->delete(self::API_BASE."/whitelabel/domains/{$sendgridDomainId}");
        } catch (\Throwable) {
            // Best-effort cleanup; ignore failures so re-authentication is never blocked.
        }
    }

    private function client()
    {
        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            throw new RuntimeException('SENDGRID_API_KEY is not configured.');
        }

        return Http::timeout(30)->withToken($apiKey)->asJson();
    }

    private function normalizeDomain(string $domain): string
    {
        $domain = mb_strtolower(trim($domain));
        $domain = preg_replace('#^https?://#', '', $domain) ?? $domain;
        $domain = rtrim(explode('/', $domain)[0], '.');

        if ($domain === '' || ! str_contains($domain, '.') || str_contains($domain, ' ')) {
            throw new InvalidArgumentException('Enter a valid domain, e.g. yourcompany.com.');
        }

        return $domain;
    }

    private function assertEmailMatchesDomain(string $fromEmail, string $domain): void
    {
        if (! filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid from-email address.');
        }

        $emailDomain = mb_strtolower(substr($fromEmail, strrpos($fromEmail, '@') + 1));
        if ($emailDomain !== $domain && ! str_ends_with($emailDomain, '.'.$domain)) {
            throw new InvalidArgumentException("The from-email must be @{$domain}.");
        }
    }

    /**
     * @return array<int, array{host: string, type: string, data: string, valid: bool}>
     */
    private function extractDnsRecords(array $dns): array
    {
        $records = [];
        foreach ($dns as $key => $entry) {
            if (! is_array($entry) || ! isset($entry['host'], $entry['data'])) {
                continue;
            }

            $records[] = [
                'label' => (string) $key,
                'host' => (string) $entry['host'],
                'type' => (string) ($entry['type'] ?? 'cname'),
                'data' => (string) $entry['data'],
                'valid' => (bool) ($entry['valid'] ?? false),
            ];
        }

        return $records;
    }
}
