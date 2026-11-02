<?php

namespace App\Http\Resources\Admin;

use App\Models\Lead;
use App\Services\Admin\AdminSmartLeadsService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Lead */
class AdminLeadResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $meta = is_array($this->meta) ? $this->meta : [];

        return [
            'id' => $this->id,
            'organization_id' => $this->organization_id,
            'organization_name' => $this->whenLoaded('organization', fn () => $this->organization?->name),
            'name' => $this->name,
            'company' => $this->whenLoaded('company', fn () => $this->company?->name) ?? ($meta['company'] ?? null),
            'score' => $this->score !== null ? (float) $this->score : null,
            'tier' => AdminSmartLeadsService::tier($this->score),
            'stage' => $this->stage,
            'source' => $this->source,
            'summary' => $this->summary,
            'email' => $meta['email'] ?? null,
            'phone' => $meta['phone'] ?? null,
            'website' => $meta['website'] ?? null,
            'location' => $meta['location'] ?? null,
            'meta' => $meta,
            'admin_outreach_prepared' => (bool) ($meta['admin_outreach_prepared'] ?? false),
            'admin_outreach_sequence' => $meta['admin_outreach_sequence'] ?? null,
            'admin_notes' => $meta['admin_notes'] ?? [],
            'save_status' => $this->save_status,
            'crm_entry' => $this->whenLoaded('crmEntry', fn () => $this->crmEntry ? [
                'id' => $this->crmEntry->id,
                'stage' => $this->crmEntry->stage?->name ?? null,
                'assignee' => $this->crmEntry->assignee?->name ?? null,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
