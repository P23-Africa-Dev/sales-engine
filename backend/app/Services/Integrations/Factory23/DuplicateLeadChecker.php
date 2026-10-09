<?php

namespace App\Services\Integrations\Factory23;

use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DuplicateLeadChecker
{
    public function __construct(
        private readonly Factory23CrmTokenService $tokenService,
        private readonly LeadFieldValidator $fieldValidator = new LeadFieldValidator,
    ) {}

    /**
     * @return array{exists: bool, f23_lead: ?array<string, mixed>, match_reason: ?string}|null
     *         null when the CRM check could not be performed
     */
    public function checkDuplicate(Organization $organization, Lead $lead): ?array
    {
        $base = rtrim((string) config('services.factory23.api_url'), '/');
        $token = $this->tokenService->resolveToken($organization);
        if ($base === '' || $token === null || ! filled($organization->f23_company_id)) {
            return null;
        }

        $meta = is_array($lead->meta) ? $lead->meta : [];
        $email = $this->fieldValidator->validateEmail(isset($meta['email']) ? (string) $meta['email'] : null);
        $name = trim((string) $lead->name);
        $companyName = trim((string) ($meta['company'] ?? ''));

        try {
            $response = Http::timeout(15)
                ->withToken($token)
                ->get($base . '/api/v1/crm/leads/check-duplicate', array_filter([
                    'company_id' => $organization->f23_company_id,
                    'email' => $email,
                    'name' => $name !== '' ? $name : null,
                    'company_name' => $companyName !== '' ? $companyName : null,
                ]));

            if (! $response->successful()) {
                Log::warning('CRM duplicate check failed', [
                    'status' => $response->status(),
                    'lead_id' => $lead->id,
                ]);

                return null;
            }

            $exists = (bool) ($response->json('data.exists') ?? false);
            $f23Lead = $response->json('data.lead');
            if (! is_array($f23Lead)) {
                $f23Lead = null;
            }

            return [
                'exists' => $exists,
                'f23_lead' => $f23Lead,
                'match_reason' => isset($response->json('data')['match_reason'])
                    ? (string) $response->json('data.match_reason')
                    : null,
            ];
        } catch (\Throwable $e) {
            Log::warning('CRM duplicate check exception', [
                'lead_id' => $lead->id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $f23Lead
     * @return array{has_new_data: bool, new_fields: list<string>, better_fields: list<string>, merge_payload: array<string, mixed>}
     */
    public function compareQuality(Lead $salesEngineLead, array $f23Lead): array
    {
        $meta = is_array($salesEngineLead->meta) ? $salesEngineLead->meta : [];
        $candidates = [
            'email' => $this->fieldValidator->validateEmail(isset($meta['email']) ? (string) $meta['email'] : null),
            'phone' => $this->fieldValidator->validatePhone(isset($meta['phone']) ? (string) $meta['phone'] : null),
            'location' => trim((string) ($meta['location'] ?? '')) ?: null,
            'company_name' => trim((string) ($meta['company'] ?? '')) ?: null,
            'website' => $this->fieldValidator->validateUrl(isset($meta['website']) ? (string) $meta['website'] : null),
            'position' => ($title = trim((string) ($meta['title'] ?? ''))) !== ''
                ? (mb_strlen($title) > 120 ? rtrim(mb_substr($title, 0, 117)) . '…' : $title)
                : null,
            'profile_urls' => $this->normalizeUrls($meta['profile_urls'] ?? null, $meta['linkedin_url'] ?? null),
            'next_action' => trim((string) ($meta['next_action'] ?? '')) ?: null,
        ];

        $newFields = [];
        $betterFields = [];
        $mergePayload = [];

        foreach ($candidates as $field => $incoming) {
            if ($incoming === null || $incoming === '' || $incoming === []) {
                continue;
            }

            $existing = $f23Lead[$field] ?? null;
            if ($existing === null || $existing === '' || $existing === []) {
                $newFields[] = $field;
                $mergePayload[$field] = $incoming;
                continue;
            }

            if ($this->isBetter($existing, $incoming, $field)) {
                $betterFields[] = $field;
                $mergePayload[$field] = $incoming;
            }
        }

        return [
            'has_new_data' => $mergePayload !== [],
            'new_fields' => $newFields,
            'better_fields' => $betterFields,
            'merge_payload' => $mergePayload,
        ];
    }

    private function isBetter(mixed $existing, mixed $incoming, string $field): bool
    {
        if ($field === 'email' && is_string($incoming) && filter_var($incoming, FILTER_VALIDATE_EMAIL)) {
            return ! is_string($existing) || ! filter_var($existing, FILTER_VALIDATE_EMAIL);
        }

        if ($field === 'profile_urls' && is_array($incoming)) {
            $existingUrls = is_array($existing) ? $existing : [];

            return count(array_diff($incoming, $existingUrls)) > 0;
        }

        if (is_string($incoming) && is_string($existing)) {
            return mb_strlen(trim($incoming)) > mb_strlen(trim($existing));
        }

        return false;
    }

    /**
     * @return list<string>|null
     */
    private function normalizeUrls(mixed $profileUrls, mixed $linkedinUrl): ?array
    {
        $urls = [];
        if (is_array($profileUrls)) {
            foreach ($profileUrls as $url) {
                if (is_string($url)) {
                    $valid = $this->fieldValidator->validateUrl($url);
                    if ($valid !== null) {
                        $urls[] = $valid;
                    }
                }
            }
        }
        if (is_string($linkedinUrl)) {
            $valid = $this->fieldValidator->validateUrl($linkedinUrl);
            if ($valid !== null) {
                $urls[] = $valid;
            }
        }

        $urls = array_values(array_unique($urls));

        return $urls !== [] ? $urls : null;
    }
}
