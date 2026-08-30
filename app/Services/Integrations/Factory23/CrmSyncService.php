<?php

namespace App\Services\Integrations\Factory23;

use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CrmSyncService
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.factory23.api_url')) !== ''
            && trim((string) config('services.factory23.api_token')) !== '';
    }

    public function status(Organization $organization): array
    {
        return [
            'configured' => $this->isConfigured(),
            'global_enabled' => (bool) config('services.factory23.crm_sync_enabled'),
            'organization_enabled' => (bool) $organization->factory23_crm_sync_enabled,
            'f23_company_id' => $organization->f23_company_id,
            'linked' => filled($organization->f23_company_id),
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
        $base = rtrim((string) config('services.factory23.api_url'), '/');

        foreach ($leads as $lead) {
            try {
                $response = Http::timeout(20)
                    ->withToken((string) config('services.factory23.api_token'))
                    ->post($base.'/api/v1/crm/leads', [
                        'name' => $lead->name,
                        'source' => 'sales_engine',
                        'score' => $lead->score,
                        'summary' => $lead->summary,
                        'company_id' => $organization->f23_company_id,
                        'external_id' => (string) $lead->id,
                    ]);

                if ($response->successful()) {
                    $lead->update([
                        'f23_lead_id' => (string) ($response->json('data.id') ?? $response->json('id') ?? ''),
                        'synced_to_f23_at' => now(),
                    ]);
                    $pushed++;
                } else {
                    $skipped++;
                    $errors[] = "Lead {$lead->id}: HTTP ".$response->status();
                }
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Lead {$lead->id}: ".$e->getMessage();
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
}
