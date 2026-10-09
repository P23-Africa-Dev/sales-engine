<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\IcpProfile */
class IcpProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'description' => $this->description ?? '',
            'isActive' => (bool) $this->is_active,
            'leadCount' => (int) $this->lead_count,
            'lastUpdated' => $this->updated_at?->toIso8601String(),
            'config' => $this->config ?? [],
        ];
    }
}
