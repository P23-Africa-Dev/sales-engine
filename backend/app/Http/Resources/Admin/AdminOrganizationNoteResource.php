<?php

namespace App\Http\Resources\Admin;

use App\Models\AdminOrganizationNote;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AdminOrganizationNote */
class AdminOrganizationNoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'organization_id' => $this->organization_id,
            'note' => $this->note,
            'admin' => $this->whenLoaded('admin', fn () => [
                'id' => $this->admin?->id,
                'name' => $this->admin?->name,
                'email' => $this->admin?->email,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
