<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Company */
class CompanyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'sector' => $this->sector,
            'location' => $this->location,
            'website' => $this->website,
            'source' => $this->source,
            'source_provider' => $this->source_provider,
            'icp_fit_score' => $this->icp_fit_score,
            'intent_score' => $this->intent_score,
            'priority_score' => $this->priority_score,
            'summary' => $this->summary,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
