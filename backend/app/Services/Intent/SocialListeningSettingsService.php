<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningSetting;

class SocialListeningSettingsService
{
    public function forIcp(Organization $organization, IcpProfile $icp): SocialListeningSetting
    {
        $setting = SocialListeningSetting::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->first();

        if ($setting) {
            return $setting;
        }

        return SocialListeningSetting::query()->create(
            SocialListeningSetting::defaultsForOrg($organization->id, $icp->id)
        );
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Organization $organization, IcpProfile $icp, array $data): SocialListeningSetting
    {
        $setting = $this->forIcp($organization, $icp);

        $allowed = [
            'enabled_sources',
            'meta_page_ids',
            'cadence_days',
            'min_score',
            'freshness_window_days',
            'intent_filters',
            'crm_destination',
            'outreach_channel_default',
            'sender_mode',
            'org_verified_from_email',
            'org_verified_domain',
            'verification_status',
        ];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $setting->{$key} = $data[$key];
            }
        }

        $setting->save();

        return $setting->fresh();
    }
}
