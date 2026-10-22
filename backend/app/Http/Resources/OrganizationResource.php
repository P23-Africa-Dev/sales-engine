<?php

namespace App\Http\Resources;

use App\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Organization */
class OrganizationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'country' => $this->country,
            'team_size' => $this->team_size,
            'purpose' => $this->purpose,
            'user_type' => $this->user_type,
            'onboarding_completed' => $this->onboarding_completed_at !== null,
            'f23_company_id' => $this->f23_company_id,
            'factory23_crm_sync_enabled' => (bool) $this->factory23_crm_sync_enabled,
            'role' => $this->when(isset($this->pivot), fn () => $this->pivot->role),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
