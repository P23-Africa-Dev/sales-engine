<?php

namespace App\Http\Resources\Admin;

use App\Models\OutreachActivity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin OutreachActivity */
class AdminOutreachActivityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'organization_id' => $this->organization_id,
            'organization_name' => $this->whenLoaded('organization', fn () => $this->organization?->name),
            'name' => $this->name,
            'channel' => str_replace(' draft', '', (string) $this->channel),
            'status' => $this->delivery_status ?? ($this->sent_at ? 'sent' : 'draft'),
            'preview' => $this->preview,
            'owner' => $this->whenLoaded('user', fn () => $this->user?->name),
            'lead_id' => $this->lead_id,
            'company_id' => $this->company_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
