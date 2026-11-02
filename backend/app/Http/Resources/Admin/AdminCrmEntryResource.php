<?php

namespace App\Http\Resources\Admin;

use App\Models\CrmEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin CrmEntry */
class AdminCrmEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'organization_id' => $this->organization_id,
            'organization_name' => $this->whenLoaded('organization', fn () => $this->organization?->name),
            'lead_id' => $this->lead_id,
            'company' => $this->whenLoaded('lead', fn () => $this->lead?->company?->name ?? $this->lead?->name),
            'contact' => data_get($this->lead?->meta, 'contact_name'),
            'email' => data_get($this->lead?->meta, 'email') ?? data_get($this->lead?->meta, 'contact_email'),
            'owner' => $this->whenLoaded('assignee', fn () => $this->assignee?->name),
            'assigned_to_user_id' => $this->assigned_to_user_id,
            'stage' => $this->whenLoaded('stage', fn () => $this->stage?->name),
            'stage_id' => $this->stage_id,
            'stage_slug' => $this->whenLoaded('stage', fn () => $this->stage?->slug),
            'pipeline' => $this->whenLoaded('pipeline', fn () => $this->pipeline?->name),
            'value' => $this->budget_amount,
            'currency' => $this->budget_currency ?? $this->pipeline?->currency_code,
            'source' => $this->lead?->source,
            'due' => data_get($this->details, 'due'),
            'next_action' => data_get($this->details, 'next_action'),
            'archived' => $this->archived_at !== null,
            'duplicate_of' => $this->lead?->crm_duplicate_of,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
