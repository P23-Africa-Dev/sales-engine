<?php

namespace App\Http\Resources\Admin;

use App\Models\AdminAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AdminAuditEvent */
class AdminAuditEventResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'reason' => $this->reason,
            'organization_id' => $this->organization_id,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'meta' => $this->meta,
            'admin' => $this->whenLoaded('admin', fn () => [
                'id' => $this->admin?->id,
                'name' => $this->admin?->name,
                'email' => $this->admin?->email,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
