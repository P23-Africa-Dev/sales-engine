<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;

class DomainIntegrityService
{
    /**
     * @return array{status: string, checks: array<int, array{key: string, label: string, status: string, message: string}>}
     */
    public function evaluate(OutreachDomainAuthentication $record): array
    {
        $checks = [];

        $checks[] = $this->checkSendGridValid($record);
        $checks[] = $this->checkNotConsumerDomain($record);
        $checks[] = $this->checkDmarc($record->domain);
        $checks[] = $this->checkMx($record->domain);

        $hasFail = collect($checks)->contains(fn (array $c) => $c['status'] === 'fail');
        $hasWarn = collect($checks)->contains(fn (array $c) => $c['status'] === 'warn');

        $status = $hasFail ? 'fail' : ($hasWarn ? 'warn' : 'pass');

        return [
            'status' => $status,
            'checks' => $checks,
        ];
    }

    public function evaluateAndPersist(OutreachDomainAuthentication $record): OutreachDomainAuthentication
    {
        $result = $this->evaluate($record);

        $wasAllowing = in_array($record->integrity_status, ['pass', 'warn'], true)
            || ($record->integrity_status === null && $record->isVerified());

        $record->update([
            'integrity_status' => $result['status'],
            'integrity_checks' => $result['checks'],
            'integrity_checked_at' => now(),
            'warmup_started_at' => $record->warmup_started_at
                ?? (in_array($result['status'], ['pass', 'warn'], true) && $record->isVerified() ? now() : null),
        ]);

        $record = $record->refresh();

        if ($wasAllowing && $result['status'] === 'fail') {
            $this->forceIdentitiesToPlatform($record->organization_id);
        }

        return $record;
    }

    public function allowsOrganizationSending(?OutreachDomainAuthentication $record): bool
    {
        if (! $record || ! $record->isVerified()) {
            return false;
        }

        if ($record->integrity_status === null) {
            $record = $this->evaluateAndPersist($record);
        }

        return in_array($record->integrity_status, ['pass', 'warn'], true);
    }

    public function forceIdentitiesToPlatform(int $organizationId): void
    {
        OutreachIdentity::query()
            ->where('organization_id', $organizationId)
            ->where('sender_mode', 'organization')
            ->update(['sender_mode' => 'platform']);
    }

    /**
     * Re-check every verified domain (daily schedule).
     */
    public function recheckAll(): int
    {
        $count = 0;

        OutreachDomainAuthentication::query()
            ->where('verification_status', 'verified')
            ->orderBy('id')
            ->chunkById(50, function ($rows) use (&$count) {
                foreach ($rows as $record) {
                    $this->evaluateAndPersist($record);
                    $count++;
                }
            });

        return $count;
    }

    /**
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function checkSendGridValid(OutreachDomainAuthentication $record): array
    {
        if ($record->valid && $record->verification_status === 'verified') {
            return [
                'key' => 'sendgrid_auth',
                'label' => 'SendGrid domain authentication',
                'status' => 'pass',
                'message' => 'Domain authentication CNAMEs are valid.',
            ];
        }

        return [
            'key' => 'sendgrid_auth',
            'label' => 'SendGrid domain authentication',
            'status' => 'fail',
            'message' => 'Complete SendGrid domain verification before sending as your organization.',
        ];
    }

    /**
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function checkNotConsumerDomain(OutreachDomainAuthentication $record): array
    {
        $fromEmail = (string) ($record->from_email ?? '');
        $domain = mb_strtolower((string) $record->domain);
        $emailDomain = $fromEmail !== '' && str_contains($fromEmail, '@')
            ? mb_strtolower(substr($fromEmail, strrpos($fromEmail, '@') + 1))
            : $domain;

        $blocked = array_map('mb_strtolower', config('outreach.consumer_domains', []));

        if (in_array($emailDomain, $blocked, true) || in_array($domain, $blocked, true)) {
            return [
                'key' => 'consumer_domain',
                'label' => 'Business domain',
                'status' => 'fail',
                'message' => 'Free mailbox domains (Gmail, Outlook, Yahoo, etc.) cannot be used as an organization From address.',
            ];
        }

        return [
            'key' => 'consumer_domain',
            'label' => 'Business domain',
            'status' => 'pass',
            'message' => 'From address uses a custom business domain.',
        ];
    }

    /**
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function checkDmarc(string $domain): array
    {
        $domain = mb_strtolower(trim($domain));
        $host = '_dmarc.'.$domain;
        $records = @dns_get_record($host, DNS_TXT) ?: [];

        $dmarc = null;
        foreach ($records as $row) {
            $txt = (string) ($row['txt'] ?? '');
            if (stripos($txt, 'v=DMARC1') !== false) {
                $dmarc = $txt;
                break;
            }
        }

        if ($dmarc === null) {
            return [
                'key' => 'dmarc',
                'label' => 'DMARC',
                'status' => 'fail',
                'message' => "Add a DMARC TXT record at {$host} (start with v=DMARC1; p=none).",
            ];
        }

        if (preg_match('/\bp=none\b/i', $dmarc)) {
            return [
                'key' => 'dmarc',
                'label' => 'DMARC',
                'status' => 'warn',
                'message' => 'DMARC is present with p=none. Consider tightening to quarantine or reject as you mature.',
            ];
        }

        return [
            'key' => 'dmarc',
            'label' => 'DMARC',
            'status' => 'pass',
            'message' => 'DMARC record found.',
        ];
    }

    /**
     * @return array{key: string, label: string, status: string, message: string}
     */
    private function checkMx(string $domain): array
    {
        $domain = mb_strtolower(trim($domain));
        $records = @dns_get_record($domain, DNS_MX) ?: [];

        if ($records === []) {
            return [
                'key' => 'mx',
                'label' => 'MX records',
                'status' => 'fail',
                'message' => 'No MX records found. Domains that cannot receive mail often bounce outreach.',
            ];
        }

        return [
            'key' => 'mx',
            'label' => 'MX records',
            'status' => 'pass',
            'message' => 'MX records found.',
        ];
    }
}
