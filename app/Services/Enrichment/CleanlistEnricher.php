<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use App\Services\Enrichment\Contracts\ContactEnrichmentProviderInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CleanlistEnricher implements ContactEnrichmentProviderInterface
{
    public function isEnabled(): bool
    {
        return trim((string) config('services.cleanlist.api_key')) !== '';
    }

    public function providerName(): string
    {
        return 'cleanlist';
    }

    /**
     * @param  array{company?: string, website?: string, linkedin_url?: string, domain?: string}  $context
     * @return array{email?: string, phone?: string, linkedin_url?: string, title?: string, company_name?: string, credits_used?: int}
     */
    public function enrichPerson(Organization $organization, string $personName, array $context = []): array
    {
        if (! $this->isEnabled()) {
            return [];
        }

        $parts = preg_split('/\s+/u', trim($personName)) ?: [];
        if (count($parts) < 2 && empty($context['linkedin_url'])) {
            return [];
        }

        $payload = array_filter([
            'full_name' => trim($personName),
            'first_name' => $parts[0] ?? null,
            'last_name' => count($parts) > 1 ? (string) end($parts) : null,
            'company_domain' => $context['domain'] ?? null,
            'company_name' => $context['company'] ?? null,
            'linkedin_url' => $context['linkedin_url'] ?? null,
            'include_email' => true,
            'include_phone' => true,
        ], fn ($v) => $v !== null && $v !== '');

        try {
            $base = rtrim((string) config('services.cleanlist.base_url', 'https://api.cleanlist.ai/v1'), '/');
            $response = Http::timeout(20)
                ->withHeaders([
                    'Authorization' => 'Bearer '.(string) config('services.cleanlist.api_key'),
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->post($base.'/people/enrich', $payload);

            if ($response->status() === 402 || $response->status() === 429) {
                Log::info('Cleanlist credits exhausted or rate limited', [
                    'status' => $response->status(),
                    'org_id' => $organization->id,
                ]);

                return [];
            }

            if (! $response->successful()) {
                Log::warning('Cleanlist enrichment failed', [
                    'status' => $response->status(),
                    'org_id' => $organization->id,
                ]);

                return [];
            }

            $data = $response->json();
            if (! is_array($data)) {
                return [];
            }

            $person = is_array($data['person'] ?? null) ? $data['person'] : $data;
            if (($data['matched'] ?? true) === false) {
                return ['credits_used' => 0];
            }

            $email = trim((string) ($person['work_email'] ?? $person['email'] ?? $person['workEmail'] ?? ''));
            $phone = trim((string) ($person['phone'] ?? $person['direct_dial'] ?? $person['mobile'] ?? ''));
            $linkedin = trim((string) ($person['linkedin_url'] ?? $person['linkedin'] ?? ''));
            $title = trim((string) ($person['title'] ?? $person['job_title'] ?? ''));
            $company = trim((string) ($person['company_name'] ?? $person['company'] ?? ''));

            $credits = (int) ($data['credits_charged'] ?? $data['credits_used'] ?? 0);
            if ($credits === 0 && ($email !== '' || $phone !== '')) {
                $credits = ($email !== '' ? 1 : 0) + ($phone !== '' ? 10 : 0);
            }

            return array_filter([
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'linkedin_url' => $linkedin !== '' ? $linkedin : null,
                'title' => $title !== '' ? $title : null,
                'company_name' => $company !== '' ? $company : null,
                'credits_used' => $credits,
            ], fn ($v) => $v !== null && $v !== '');
        } catch (\Throwable $e) {
            Log::warning('Cleanlist enrichment exception', [
                'error' => $e->getMessage(),
                'org_id' => $organization->id,
            ]);

            return [];
        }
    }
}
