<?php

namespace App\Http\Resources;

use App\Models\SocialSignal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SocialSignal */
class SocialSignalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'signal' => $this->post_text,
            'source' => $this->source_label,
            'sourceIcon' => $this->source_icon,
            'persona' => $this->persona,
            'company' => $this->company_name,
            'location' => $this->location_text,
            'intent' => $this->intent_label,
            'intentColor' => $this->intent_color,
            'description' => $this->intent_description,
            'score' => (int) round((float) $this->score),
            'profile' => $this->profile_name,
            'reasons' => $this->reasons ?? [],
            'signalType' => $this->signal_type,
            'buyingStage' => $this->buying_stage,
            'problem' => $this->problem,
            'urgency' => $this->urgency,
            'suggestedMessage' => $this->suggested_message,
            'recommendedAction' => $this->recommended_action,
            'status' => $this->status,
            'posted_at' => $this->posted_at?->toIso8601String(),
            'post_url' => $this->post_url,
            'lead_id' => $this->lead_id,
            'f23_lead_id' => $this->f23_lead_id,
        ];
    }
}
