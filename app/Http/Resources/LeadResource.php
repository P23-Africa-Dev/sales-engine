<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Lead */
class LeadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'source' => $this->source,
            'score' => $this->score !== null ? (int) round((float) $this->score) : null,
            'summary' => $this->summary,
            'stage' => $this->stage,
            'company_id' => $this->company_id,
            'icp_profile_id' => $this->icp_profile_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
