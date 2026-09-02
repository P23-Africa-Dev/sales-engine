<?php

namespace App\Services\Intent;

use App\Models\Company;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\SocialSignal;
use App\Services\Integrations\Factory23\CrmSyncService;

class SignalToLeadService
{
    public function __construct(private readonly CrmSyncService $crmSync) {}

    /**
     * @return array{lead: Lead, crm: ?array}
     */
    public function convert(SocialSignal $signal, Organization $organization, bool $pushCrm = true): array
    {
        $companyName = $signal->company_name ?: ($signal->profile_name ?: 'Social prospect');

        $company = Company::query()->firstOrCreate(
            [
                'organization_id' => $organization->id,
                'normalized_name' => Company::normalizeName($companyName),
                'location' => $signal->location_text,
            ],
            [
                'name' => $companyName,
                'source' => 'social_listening',
                'source_provider' => $signal->platform,
                'summary' => $signal->post_text,
                'priority_score' => $signal->score,
            ]
        );

        $lead = Lead::query()->create([
            'organization_id' => $organization->id,
            'company_id' => $company->id,
            'icp_profile_id' => $signal->icp_profile_id,
            'name' => $companyName,
            'source' => 'social_'.$signal->platform,
            'score' => $signal->score,
            'summary' => $signal->post_text,
            'stage' => 'new',
            'meta' => [
                'social_signal_id' => $signal->id,
                'post_url' => $signal->post_url,
            ],
        ]);

        $crm = null;
        if ($pushCrm && $this->crmSync->canSync($organization)) {
            try {
                $crm = $this->crmSync->pushLead($organization, $lead);
                $lead->refresh();
            } catch (\Throwable) {
                // best effort
            }
        }

        $signal->update([
            'lead_id' => $lead->id,
            'f23_lead_id' => $lead->f23_lead_id,
            'status' => $crm ? 'synced' : 'reviewed',
        ]);

        return ['lead' => $lead, 'crm' => $crm];
    }
}
