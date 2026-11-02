<?php

namespace App\Http\Resources\Admin;

use App\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Organization */
class AdminOrganizationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $owner = $this->relationLoaded('users') ? $this->users->first() : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status ?? 'active',
            'industry' => $this->industry,
            'country' => $this->country,
            'purpose' => $this->purpose,
            'scope' => $this->purpose,
            'team_size' => $this->team_size,
            'crm_stale_days' => $this->crm_stale_days ?? 7,
            'owner' => $owner ? [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
            ] : null,
            'prospect_pool' => (int) ($this->leads_count ?? 0),
            'companies_count' => (int) ($this->companies_count ?? 0),
            'leads_count' => (int) ($this->leads_count ?? 0),
            'onboarding_completed' => $this->onboarding_completed_at !== null,
            'created_at' => $this->created_at?->toIso8601String(),
            'search_limit_monthly' => $this->search_limit_monthly,
            'outreach_email_limit_monthly' => $this->outreach_email_limit_monthly,
            'enrichment_limit_monthly' => $this->enrichment_limit_monthly,
        ];
    }
}
