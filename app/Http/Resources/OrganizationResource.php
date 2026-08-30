<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Organization */
class OrganizationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'f23_company_id' => $this->f23_company_id,
            'factory23_crm_sync_enabled' => (bool) $this->factory23_crm_sync_enabled,
            'role' => $this->when(isset($this->pivot), fn () => $this->pivot->role),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
