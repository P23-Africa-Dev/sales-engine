<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use App\Services\Enrichment\Contracts\ContactEnrichmentProviderInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BytemineEnricher implements ContactEnrichmentProviderInterface
{
    public function isEnabled(): bool
    {
        return trim((string) config('services.bytemine.api_key')) !== '';
    }

    public function providerName(): string
    {
        return 'bytemine';
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
        if ($parts === []) {
            return [];
        }

        $firstName = $parts[0];
        $lastName = count($parts) > 1 ? (string) end($parts) : '';

        $payload = array_filter([
            'firstName' => $firstName,
            'lastName' => $lastName !== '' ? $lastName : null,
            'companyDomain' => $context['domain'] ?? null,
            'linkedin' => $context['linkedin_url'] ?? null,
            'company' => $context['company'] ?? null,
        ], fn ($v) => is_string($v) && trim($v) !== '');

        if (! isset($payload['linkedin']) && ! isset($payload['companyDomain']) && $lastName === '') {
            return [];
        }

        try {
            $base = rtrim((string) config('services.bytemine.base_url', 'https://api.bytemine.ai/v1'), '/');
            $response = Http::timeout(20)
                ->withHeaders([
                    'Authorization' => 'Bearer '.(string) config('services.bytemine.api_key'),
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                ])
                ->post($base.'/people/enrich', $payload);

            if ($response->status() === 402 || $response->status() === 429) {
                Log::info('Bytemine credits exhausted or rate limited', [
                    'status' => $response->status(),
                    'org_id' => $organization->id,
                ]);

                return [];
            }

            if (! $response->successful()) {
                Log::warning('Bytemine enrichment failed', [
                    'status' => $response->status(),
                    'org_id' => $organization->id,
                ]);

                return [];
            }

            $data = $response->json();
            if (! is_array($data)) {
                return [];
            }

            // Support both flat and nested response shapes.
            $person = is_array($data['person'] ?? null) ? $data['person'] : $data;
            if (($data['matched'] ?? true) === false || ($data['status'] ?? '') === 'no_match') {
                return ['credits_used' => 0];
            }

            $email = trim((string) (
                $person['workEmail']
                ?? $person['work_email']
                ?? $person['email']
                ?? $person['personalEmail']
                ?? ''
            ));
            $phone = trim((string) (
                $person['mobilePhone']
                ?? $person['mobile']
                ?? $person['directDial']
                ?? $person['phone']
                ?? ''
            ));
            $linkedin = trim((string) ($person['linkedin'] ?? $person['linkedinUrl'] ?? $person['linkedin_url'] ?? ''));
            $title = trim((string) ($person['title'] ?? $person['jobTitle'] ?? ''));
            $company = trim((string) ($person['company'] ?? $person['companyName'] ?? $person['company_name'] ?? ''));

            $credits = (int) ($data['credits_charged'] ?? $data['creditsUsed'] ?? (
                ($email !== '' || $phone !== '') ? 1 : 0
            ));

            return array_filter([
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'linkedin_url' => $linkedin !== '' ? $linkedin : null,
                'title' => $title !== '' ? $title : null,
                'company_name' => $company !== '' ? $company : null,
                'credits_used' => $credits,
            ], fn ($v) => $v !== null && $v !== '');
        } catch (\Throwable $e) {
            Log::warning('Bytemine enrichment exception', [
                'error' => $e->getMessage(),
                'org_id' => $organization->id,
            ]);

            return [];
        }
    }
}
