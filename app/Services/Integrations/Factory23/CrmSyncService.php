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
    /** @var array<string, string> */
    private array $defaultStatusByCompany = [];

    public function isConfigured(): bool
    {
        if (trim((string) config('services.factory23.api_url')) === '') {
            return false;
        }

        if (trim((string) config('services.factory23.api_token')) !== '') {
            return true;
        }

        return $this->companyTokens() !== [];
    }

    public function isConfiguredForOrganization(Organization $organization): bool
    {
        if (trim((string) config('services.factory23.api_url')) === '') {
            return false;
        }

        return $this->resolveApiToken($organization) !== null;
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
            self::REASON_NOT_CONFIGURED => 'Factory23 CRM API is not configured on the server (missing API URL or token).',
            self::REASON_SYNC_DISABLED => 'CRM sync is disabled for this organization.',
            self::REASON_NOT_LINKED => 'Factory23 is not linked for this organization. Sign out and sign back in, or contact your admin.',
            default => 'CRM sync is unavailable for this organization.',
        };
    }

    /**
     * Push a single lead to Factory23 CRM (any stage).
     *
     * @return array{synced: bool, f23_lead_id: ?string, already_synced?: bool}
     */
    public function pushLead(Organization $organization, Lead $lead): array
    {
        if (filled($lead->synced_to_f23_at) && filled($lead->f23_lead_id)) {
            return [
                'synced' => true,
                'f23_lead_id' => (string) $lead->f23_lead_id,
                'already_synced' => true,
            ];
        }

        $blockReason = $this->syncBlockReason($organization);
        if ($blockReason !== null) {
            throw new CrmSyncException($this->syncBlockMessage($blockReason), $blockReason);
        }

        $base = rtrim((string) config('services.factory23.api_url'), '/');
        $token = $this->resolveApiToken($organization);

        if ($token === null) {
            throw new CrmSyncException($this->syncBlockMessage(self::REASON_NOT_CONFIGURED), self::REASON_NOT_CONFIGURED);
        }

        $response = Http::timeout(20)
            ->withToken($token)
            ->post($base . '/api/v1/crm/leads', $this->buildLeadPayload($organization, $lead));

        if (! $response->successful()) {
            $message = (string) ($response->json('message') ?? 'Unknown error');
            Log::warning('F23 CRM single lead sync failed', [
                'lead_id' => $lead->id,
                'status' => $response->status(),
                'message' => $message,
            ]);
            throw new CrmSyncException('Failed to push lead to CRM (HTTP ' . $response->status() . '): ' . $message, 'push_failed');
        }

        $f23LeadId = (string) ($response->json('data.lead.id') ?? $response->json('data.id') ?? $response->json('id') ?? '');

        $lead->update([
            'f23_lead_id' => $f23LeadId,
            'synced_to_f23_at' => now(),
            'save_status' => Lead::SAVE_SAVED,
        ]);

        return [
            'synced' => true,
            'f23_lead_id' => $f23LeadId,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildLeadPayload(Organization $organization, Lead $lead): array
    {
        $meta = is_array($lead->meta) ? $lead->meta : [];
        $title = trim((string) ($meta['title'] ?? ''));
        $company = trim((string) ($meta['company'] ?? ''));
        $sourceUrl = trim((string) ($meta['linkedin_url'] ?? $meta['source_url'] ?? ''));

        return [
            'name' => $lead->name,
            'source' => 'sales_engine',
            'status' => $this->resolveDefaultLeadStatus($organization),
            'priority' => 'medium',
            'company_id' => $organization->f23_company_id,
            'next_action' => filled($lead->summary) ? mb_substr((string) $lead->summary, 0, 255) : null,
            'meta' => array_filter([
                'sales_engine_lead_id' => $lead->id,
                'score' => $lead->score,
                'summary' => $lead->summary,
                'title' => $title !== '' ? $title : null,
                'company' => $company !== '' ? $company : null,
                'source_url' => $sourceUrl !== '' ? $sourceUrl : null,
            ]),
        ];
    }

    private function resolveDefaultLeadStatus(Organization $organization): string
    {
        $companyId = (string) $organization->f23_company_id;
        if ($companyId !== '' && isset($this->defaultStatusByCompany[$companyId])) {
            return $this->defaultStatusByCompany[$companyId];
        }

        $fallbacks = ['new_lead', 'newly_lead', 'contacted', 'qualified'];
        $base = rtrim((string) config('services.factory23.api_url'), '/');
        $token = $this->resolveApiToken($organization);

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

    private function resolveApiToken(Organization $organization): ?string
    {
        $companyId = (string) ($organization->f23_company_id ?? '');
        $companyTokens = $this->companyTokens();

        if ($companyId !== '' && isset($companyTokens[$companyId])) {
            $token = trim((string) $companyTokens[$companyId]);

            return $token !== '' ? $token : null;
        }

        $default = trim((string) config('services.factory23.api_token'));

        return $default !== '' ? $default : null;
    }
}
