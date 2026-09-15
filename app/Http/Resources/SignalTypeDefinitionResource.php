<?php

namespace App\Http\Resources;

use App\Models\SignalTypeDefinition;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SignalTypeDefinition */
class SignalTypeDefinitionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'key' => $this->key,
            'label' => $this->label,
            'pack' => $this->pack,
            'triggerDescription' => $this->trigger_description,
            'feedsEnrichment' => (bool) $this->feeds_enrichment,
            'recencyWindowDays' => (int) $this->default_recency_window_days,
        ];
    }
}
