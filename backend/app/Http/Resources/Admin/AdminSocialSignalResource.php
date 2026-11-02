<?php

namespace App\Http\Resources\Admin;

use App\Models\SocialSignal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SocialSignal */
class AdminSocialSignalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $uiStatus = match ($this->status) {
            'reviewed' => 'Approved',
            'dismissed' => 'Suppressed',
            default => 'Needs review',
        };

        return [
            'id' => $this->id,
            'organization_id' => $this->organization_id,
            'organization_name' => $this->whenLoaded('organization', fn () => $this->organization?->name),
            'company' => $this->company_name,
            'author' => $this->profile_name,
            'source' => $this->platform,
            'title' => $this->intent_label ?: $this->signal_type,
            'quote' => $this->post_text,
            'score' => (float) $this->score,
            'stage' => $this->buying_stage,
            'status' => $uiStatus,
            'admin_status' => $uiStatus,
            'backend_status' => $this->status,
            'date' => $this->created_at?->toDateString(),
            'crm' => $this->lead_id !== null || $this->status === 'synced',
        ];
    }
}
