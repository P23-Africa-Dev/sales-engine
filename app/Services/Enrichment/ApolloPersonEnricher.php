<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ApolloPersonEnricher
{
    public function isEnabled(): bool
    {
        return trim((string) config('services.apollo.api_key')) !== '';
    }

    /**
     * @return array{title?: string, company_name?: string, email?: string, phone?: string, linkedin_url?: string}
     */
    public function enrich(Organization $organization, string $personName, ?string $companyName = null): array
    {
        if (! $this->isEnabled()) {
            return [];
        }

        try {
            $payload = [
                'api_key' => (string) config('services.apollo.api_key'),
                'q_keywords' => $personName,
                'page' => 1,
                'per_page' => 1,
            ];

            if (filled($companyName)) {
                $payload['q_organization_name'] = $companyName;
            }

            $response = Http::timeout(20)
                ->post('https://api.apollo.io/v1/mixed_people/search', $payload);

            if (! $response->successful()) {
                Log::warning('Apollo person enrichment failed', ['status' => $response->status()]);

                return [];
            }

            $people = $response->json('people') ?? [];
            $person = is_array($people) ? ($people[0] ?? null) : null;

            if (! is_array($person)) {
                return [];
            }

            return array_filter([
                'title' => trim((string) ($person['title'] ?? '')),
                'company_name' => trim((string) ($person['organization_name'] ?? '')),
                'email' => trim((string) ($person['email'] ?? '')),
                'phone' => trim((string) (($person['phone_numbers'][0]['sanitized_number'] ?? '') ?: '')),
                'linkedin_url' => trim((string) ($person['linkedin_url'] ?? '')),
            ], fn(string $v) => $v !== '');
        } catch (\Throwable $e) {
            Log::warning('Apollo person enrichment exception', ['error' => $e->getMessage()]);

            return [];
        }
    }
}
