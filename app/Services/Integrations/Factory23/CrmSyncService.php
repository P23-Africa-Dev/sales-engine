<?php

namespace App\Services\Integrations\Factory23;

use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Services\Integrations\Factory23\CrmSyncException;

class CrmSyncService
{
    public const REASON_NOT_CONFIGURED = 'not_configured';

    public const REASON_SYNC_DISABLED = 'sync_disabled';

    public const REASON_NOT_LINKED = 'not_linked';

    public const REASON_TOKEN_INVALID = 'token_invalid';

    /** @var array<string, string> */
    private array $defaultStatusByCompany = [];

    public function __construct(
        private readonly Factory23CrmTokenService $tokenService,
        private readonly DuplicateLeadChecker $duplicateChecker,
        private readonly LeadFieldValidator $fieldValidator,
    ) {}

    public function isConfigured(): bool
    {
        if (trim((string) config('services.factory23.api_url')) === '') {
            return false;
        }

        if (trim((string) config('services.factory23.api_token')) !== '') {
            return true;
        }

        if ($this->companyTokens() !== []) {
            return true;
        }

        return Organization::query()
            ->whereNotNull('f23_api_token')
            ->exists();
    }

    public function isConfiguredForOrganization(Organization $organization): bool
    {
        if (trim((string) config('services.factory23.api_url')) === '') {
            return false;
        }

        return $this->tokenService->hasResolvableToken($organization);
    }

    public function status(Organization $organization): array
    {
        $blockReason = $this->syncBlockReason($organization);

        return [
            'configured' => $this->isConfiguredForOrganization($organization),
            'global_enabled' => (bool) config('services.factory23.crm_sync_enabled'),
            'organization_enabled' => (bool) $organization->factory23_crm_sync_enabled,
            'f23_company_id' => $organization->f23_company_id,
            'linked' => filled($organization->f23_company_id),
            'token_linked' => filled($organization->f23_api_token),
            'can_sync' => $blockReason === null,
            'block_reason' => $blockReason,
            'block_message' => $blockReason !== null ? $this->syncBlockMessage($blockReason) : null,
        ];
    }

    /**
     * Push Qualified leads to Factory23 CRM when enabled.
     *
     * @return array{pushed: int, skipped: int, errors: list<string>}
     */
    public function syncQualified(Organization $organization): array
    {
        if (! config('services.factory23.crm_sync_enabled') && ! $organization->factory23_crm_sync_enabled) {
            return ['pushed' => 0, 'skipped' => 0, 'errors' => ['CRM sync is disabled.']];
        }

        if (! $this->isConfigured()) {
            return ['pushed' => 0, 'skipped' => 0, 'errors' => ['Factory23 API URL/token not configured.']];
        }

        $leads = Lead::query()
            ->where('organization_id', $organization->id)
            ->where('stage', 'qualified')
            ->whereNull('synced_to_f23_at')
            ->limit(50)
            ->get();

        $pushed = 0;
        $skipped = 0;
        $errors = [];

        foreach ($leads as $lead) {
            try {
                $this->pushLead($organization, $lead);
                $pushed++;
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Lead {$lead->id}: " . $e->getMessage();
                Log::warning('F23 CRM sync failed', ['lead_id' => $lead->id, 'error' => $e->getMessage()]);
            }
        }

        return compact('pushed', 'skipped', 'errors');
    }

    public function enableForOrganization(Organization $organization, bool $enabled): Organization
    {
        $organization->update(['factory23_crm_sync_enabled' => $enabled]);

        return $organization->fresh();
    }

    public function canSync(Organization $organization): bool
    {
        return $this->syncBlockReason($organization) === null;
    }

    public function syncBlockReason(Organization $organization): ?string
    {
        if (! $this->isConfiguredForOrganization($organization)) {
            return self::REASON_NOT_CONFIGURED;
        }

        if (! config('services.factory23.crm_sync_enabled') && ! $organization->factory23_crm_sync_enabled) {
            return self::REASON_SYNC_DISABLED;
        }

        if (! filled($organization->f23_company_id)) {
            return self::REASON_NOT_LINKED;
        }

        return null;
    }

    public function syncBlockMessage(?string $reason): string
    {
        return match ($reason) {
            self::REASON_NOT_CONFIGURED => 'CRM connection is not ready yet. Refresh this page while signed in to Factory23, or sign out and back in.',
            self::REASON_SYNC_DISABLED => 'CRM sync is disabled for this organization.',
            self::REASON_NOT_LINKED => 'Factory23 is not linked for this organization. Sign out and sign back in, or contact your admin.',
            self::REASON_TOKEN_INVALID => 'Your Factory23 session expired for CRM sync. Refresh this page to reconnect.',
            default => 'CRM sync is unavailable for this organization.',
        };
    }

    public function ensureOrganizationToken(Organization $organization, string $accessToken): array
    {
        if (! filled($organization->f23_company_id)) {
            return [
                'linked' => false,
                'token_registered' => false,
                'status' => $this->status($organization),
            ];
        }

        $registered = $this->tokenService->registerForOrganization($organization, $accessToken);

        return [
            'linked' => true,
            'token_registered' => $registered,
            'status' => $this->status($organization->fresh()),
        ];
    }

    /**
     * Push a single lead to Factory23 CRM (any stage).
     *
     * @param  array{status?: string, pipeline_stage?: string}  $options
     * @return array{
     *   synced: bool,
     *   f23_lead_id: ?string,
     *   already_synced?: bool,
     *   updated?: bool,
     *   fields_updated?: list<string>,
     *   skipped_reason?: string,
     *   crm_duplicate?: bool
     * }
     */
    public function pushLead(Organization $organization, Lead $lead, array $options = []): array
    {
        if (filled($lead->synced_to_f23_at) && filled($lead->f23_lead_id)) {
            return [
                'synced' => true,
                'f23_lead_id' => (string) $lead->f23_lead_id,
                'already_synced' => true,
                'crm_duplicate' => filled($lead->crm_duplicate_of),
            ];
        }

        $blockReason = $this->syncBlockReason($organization);
        if ($blockReason !== null) {
            throw new CrmSyncException($this->syncBlockMessage($blockReason), $blockReason);
        }

        $base = rtrim((string) config('services.factory23.api_url'), '/');
        $token = $this->tokenService->resolveToken($organization);

        if ($token === null) {
            throw new CrmSyncException($this->syncBlockMessage(self::REASON_NOT_CONFIGURED), self::REASON_NOT_CONFIGURED);
        }

        $duplicate = $this->duplicateChecker->checkDuplicate($organization, $lead);
        if ($duplicate !== null && ($duplicate['exists'] ?? false) === true) {
            return $this->handleExistingCrmLead($organization, $lead, $duplicate, $base, $token);
        }

        $payload = $this->buildLeadPayload($organization, $lead, $options);
        $response = $this->postWithRetry($base.'/api/v1/crm/leads', $token, $payload, $organization, $lead);

        $f23LeadId = (string) ($response->json('data.lead.id') ?? $response->json('data.id') ?? $response->json('id') ?? '');

        $lead->update([
            'f23_lead_id' => $f23LeadId,
            'synced_to_f23_at' => now(),
            'save_status' => Lead::SAVE_SAVED,
            'crm_duplicate_of' => null,
            'crm_duplicate_reason' => null,
            'crm_fields_updated' => null,
        ]);

        return [
            'synced' => true,
            'f23_lead_id' => $f23LeadId,
            'crm_duplicate' => false,
        ];
    }

    /**
     * @param  array{exists: bool, f23_lead: ?array<string, mixed>, match_reason: ?string}  $duplicate
     * @return array<string, mixed>
     */
    private function handleExistingCrmLead(
        Organization $organization,
        Lead $lead,
        array $duplicate,
        string $base,
        string $token,
    ): array {
        $f23Lead = $duplicate['f23_lead'] ?? [];
        $f23LeadId = (string) ($f23Lead['id'] ?? '');
        $matchReason = (string) ($duplicate['match_reason'] ?? 'existing');

        if ($f23LeadId === '') {
            throw new CrmSyncException(
                'A matching lead already exists in CRM, but its ID could not be resolved.',
                'duplicate_unresolved',
            );
        }

        $comparison = $this->duplicateChecker->compareQuality($lead, $f23Lead);
        $fieldsUpdated = [];
        $updated = false;

        if ($comparison['has_new_data']) {
            $mergePayload = array_merge($comparison['merge_payload'], [
                'company_id' => $organization->f23_company_id,
                'strategy' => 'better_quality',
            ]);

            $response = $this->requestWithRetry(
                'patch',
                $base.'/api/v1/crm/leads/'.$f23LeadId.'/merge',
                $token,
                $mergePayload,
                $organization,
                $lead,
            );

            $updated = (bool) ($response->json('data.updated') ?? false);
            $fieldsUpdated = $response->json('data.fields_changed') ?? $comparison['new_fields'];
            if (! is_array($fieldsUpdated)) {
                $fieldsUpdated = [];
            }
            $fieldsUpdated = array_values(array_map('strval', $fieldsUpdated));
        }

        $reasonLabel = match ($matchReason) {
            'email' => 'Matched existing CRM lead by email',
            'name_company' => 'Matched existing CRM lead by name and company',
            'name' => 'Matched existing CRM lead by name',
            default => 'Matched an existing CRM lead',
        };

        $lead->update([
            'f23_lead_id' => $f23LeadId,
            'synced_to_f23_at' => now(),
            'save_status' => Lead::SAVE_SAVED,
            'crm_duplicate_of' => $f23LeadId,
            'crm_duplicate_reason' => $reasonLabel,
            'crm_fields_updated' => $fieldsUpdated !== [] ? $fieldsUpdated : null,
        ]);

        return [
            'synced' => true,
            'f23_lead_id' => $f23LeadId,
            'already_synced' => ! $updated,
            'updated' => $updated,
            'fields_updated' => $fieldsUpdated,
            'skipped_reason' => $updated ? null : 'identical',
            'crm_duplicate' => true,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function postWithRetry(
        string $url,
        string $token,
        array $payload,
        Organization $organization,
        Lead $lead,
    ): \Illuminate\Http\Client\Response {
        return $this->requestWithRetry('post', $url, $token, $payload, $organization, $lead);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function requestWithRetry(
        string $method,
        string $url,
        string $token,
        array $payload,
        Organization $organization,
        Lead $lead,
    ): \Illuminate\Http\Client\Response {
        $attempts = 3;
        $lastException = null;

        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            try {
                $pending = Http::timeout(20)->withToken($token);
                $response = $method === 'patch'
                    ? $pending->patch($url, $payload)
                    : $pending->post($url, $payload);

                if (in_array($response->status(), [401, 403], true) && filled($organization->f23_api_token)) {
                    $this->tokenService->clearForOrganization($organization);
                    throw new CrmSyncException($this->syncBlockMessage(self::REASON_TOKEN_INVALID), self::REASON_TOKEN_INVALID);
                }

                if ($response->successful()) {
                    return $response;
                }

                if (in_array($response->status(), [500, 502, 503, 504], true) && $attempt < $attempts) {
                    usleep((int) (1000000 * (2 ** ($attempt - 1))));
                    continue;
                }

                if ($response->status() === 422) {
                    throw new CrmSyncException($this->formatValidationMessage($response), 'validation_failed');
                }

                if (in_array($response->status(), [500, 502, 503, 504], true)) {
                    throw new RetryableCrmSyncException(
                        'CRM is temporarily unavailable. Please try again in a moment.',
                        'transient_failure',
                    );
                }

                $message = (string) ($response->json('message') ?? 'Unknown error');
                Log::warning('F23 CRM lead sync failed', [
                    'lead_id' => $lead->id,
                    'status' => $response->status(),
                    'message' => $message,
                    'method' => $method,
                ]);
                throw new CrmSyncException(
                    'Could not save lead to CRM (HTTP '.$response->status().'): '.$message,
                    'push_failed',
                );
            } catch (CrmSyncException $e) {
                throw $e;
            } catch (\Throwable $e) {
                $lastException = $e;
                if ($attempt < $attempts) {
                    usleep((int) (1000000 * (2 ** ($attempt - 1))));
                    continue;
                }
            }
        }

        throw new RetryableCrmSyncException(
            'CRM sync timed out after several attempts. Please try again.',
            'timeout',
        );
    }

    private function formatValidationMessage(\Illuminate\Http\Client\Response $response): string
    {
        $errors = $response->json('errors');
        if (is_array($errors) && $errors !== []) {
            $parts = [];
            foreach ($errors as $field => $messages) {
                $label = is_string($field) ? str_replace('_', ' ', $field) : 'field';
                $first = is_array($messages) ? (string) ($messages[0] ?? '') : (string) $messages;
                if ($first !== '') {
                    $parts[] = $first;
                } else {
                    $parts[] = "Invalid {$label}.";
                }
            }

            if ($parts !== []) {
                return 'Some lead details could not be saved: '.implode(' ', $parts);
            }
        }

        $message = (string) ($response->json('message') ?? 'Validation failed.');

        // Friendlier rewrite for common URL validation failures (website often mislabeled as mobile in older clients).
        if (preg_match('/\b(website|mobile|url)\b.*valid URL/i', $message)) {
            return 'A website/profile URL on this lead was invalid, so it was not sent. Other details can still be saved — try again.';
        }

        return 'Could not save lead to CRM: '.$message;
    }

    /**
     * @param  array{status?: string, pipeline_stage?: string}  $options
     * @return array<string, mixed>
     */
    private function buildLeadPayload(Organization $organization, Lead $lead, array $options = []): array
    {
        $meta = is_array($lead->meta) ? $lead->meta : [];
        $title = trim((string) ($meta['title'] ?? ''));
        $company = trim((string) ($meta['company'] ?? ''));
        $location = trim((string) ($meta['location'] ?? ''));
        $email = trim((string) ($meta['email'] ?? ''));
        $phone = trim((string) ($meta['phone'] ?? ''));
        $website = trim((string) ($meta['website'] ?? ''));
        $profileUrls = $this->normalizeProfileUrls($meta['profile_urls'] ?? null, $meta['linkedin_url'] ?? null);
        $sourceUrl = trim((string) ($meta['source_url'] ?? $meta['linkedin_url'] ?? ''));
        $nextAction = trim((string) ($meta['next_action'] ?? ''));
        if ($nextAction === '' || $this->looksLikeListicleFragment($nextAction)) {
            $nextAction = 'Review and qualify this lead';
        }

        $statusOverride = trim((string) ($options['status'] ?? $meta['crm_status'] ?? ''));
        $pipelineStage = trim((string) ($options['pipeline_stage'] ?? $meta['crm_destination'] ?? ''));
        $status = $statusOverride !== ''
            ? $statusOverride
            : $this->resolveDefaultLeadStatus($organization);

        $raw = array_filter([
            'name' => $lead->name,
            'source' => 'sales_engine',
            'status' => $status,
            'priority' => 'medium',
            'company_id' => $organization->f23_company_id,
            'position' => $title !== '' ? $title : null,
            'company_name' => $company !== '' ? $company : null,
            'location' => $location !== '' ? $location : null,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null,
            'website' => $website !== '' ? $website : null,
            'profile_urls' => $profileUrls !== [] ? $profileUrls : null,
            'next_action' => $nextAction,
            'meta' => array_filter([
                'sales_engine_lead_id' => $lead->id,
                'score' => $lead->score,
                'summary' => $lead->summary,
                'source_url' => $sourceUrl !== '' ? $sourceUrl : null,
                'enrichment_confidence' => $meta['enrichment_confidence'] ?? null,
                'pipeline_stage' => $pipelineStage !== '' ? $pipelineStage : null,
                'social_signal_id' => $meta['social_signal_id'] ?? null,
            ]),
        ], fn ($value) => $value !== null);

        return $this->fieldValidator->sanitizePayload($raw)['payload'];
    }

    /**
     * @param  mixed  $profileUrls
     * @return list<string>
     */
    private function normalizeProfileUrls(mixed $profileUrls, mixed $linkedinUrl): array
    {
        $urls = [];

        if (is_array($profileUrls)) {
            foreach ($profileUrls as $url) {
                if (is_string($url) && trim($url) !== '') {
                    $urls[] = trim($url);
                }
            }
        }

        if (is_string($linkedinUrl) && trim($linkedinUrl) !== '') {
            $urls[] = trim($linkedinUrl);
        }

        return array_values(array_unique($urls));
    }

    private function looksLikeListicleFragment(string $text): bool
    {
        return (bool) preg_match('/\d+[\.\)]\s+[A-Z][a-z]+/u', $text)
            || str_contains(mb_strtolower($text), ' · ');
    }

    private function resolveDefaultLeadStatus(Organization $organization): string
    {
        $companyId = (string) $organization->f23_company_id;
        if ($companyId !== '' && isset($this->defaultStatusByCompany[$companyId])) {
            return $this->defaultStatusByCompany[$companyId];
        }

        $fallbacks = ['new_lead', 'newly_lead', 'contacted', 'qualified'];
        $base = rtrim((string) config('services.factory23.api_url'), '/');
        $token = $this->tokenService->resolveToken($organization);

        if ($token === null) {
            return $fallbacks[0];
        }

        $response = Http::timeout(10)
            ->withToken($token)
            ->get($base . '/api/v1/crm/labels', [
                'company_id' => $organization->f23_company_id,
            ]);

        $status = null;
        if ($response->successful()) {
            $items = $response->json('data.items') ?? [];
            if (is_array($items)) {
                foreach ($items as $item) {
                    $slug = is_array($item) ? ($item['slug'] ?? null) : null;
                    if (is_string($slug) && $slug !== '') {
                        $status = $slug;
                        break;
                    }
                }
            }
        }

        if ($status === null) {
            $status = $fallbacks[0];
        }

        if ($companyId !== '') {
            $this->defaultStatusByCompany[$companyId] = $status;
        }

        return $status;
    }

    /**
     * @return array<string, string>
     */
    private function companyTokens(): array
    {
        $tokens = config('services.factory23.company_tokens');

        return is_array($tokens) ? $tokens : [];
    }
}
