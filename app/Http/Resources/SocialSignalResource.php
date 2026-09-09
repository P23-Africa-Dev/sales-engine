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
            'summary' => $this->summary,
            'source' => $this->source_label,
            'sourceIcon' => $this->source_icon,
            'persona' => $this->persona,
            'company' => $this->company_name,
            'entityType' => $this->entity_type,
            'industry' => $this->industry,
            'keyTopics' => $this->key_topics ?? [],
            'competitors' => $this->competitors ?? [],
            'followUpStrategy' => $this->follow_up_strategy,
            'location' => $this->location_text,
            'intent' => $this->intent_label,
            'intentColor' => $this->intent_color,
            'description' => $this->intent_description,
            'score' => (int) round((float) $this->score),
            'profile' => $this->profile_name,
            'author_profile_url' => $this->author_profile_url,
            'platform' => $this->platform,
            'reasons' => $this->reasons ?? [],
            'signalType' => $this->signal_type,
            'buyingStage' => $this->buying_stage,
            'problem' => $this->problem,
            'urgency' => $this->urgency,
            'suggestedMessage' => $this->suggested_message,
            'recommendedAction' => $this->recommendedActionShape(),
            'whyThisMattersToYou' => $this->why_this_matters_to_you,
            'benefits' => $this->benefits ?? [],
            'personalRecommendedAction' => $this->personalRecommendedActionShape(),
            'status' => $this->status,
            'posted_at' => $this->posted_at?->toIso8601String(),
            'post_url' => $this->post_url,
            'lead_id' => $this->lead_id,
            'f23_lead_id' => $this->f23_lead_id,
        ];
    }

    /**
     * @return array{title: string, detail: string}
     */
    private function recommendedActionShape(): array
    {
        if ($this->recommended_action_title || $this->recommended_action_detail) {
            return [
                'title' => (string) ($this->recommended_action_title ?? ''),
                'detail' => (string) ($this->recommended_action_detail ?? ''),
            ];
        }

        return $this->splitLegacyAction((string) ($this->recommended_action ?? ''));
    }

    /**
     * @return array{title: string, detail: string}
     */
    private function personalRecommendedActionShape(): array
    {
        if ($this->personal_recommended_action_title || $this->personal_recommended_action_detail) {
            return [
                'title' => (string) ($this->personal_recommended_action_title ?? ''),
                'detail' => (string) ($this->personal_recommended_action_detail ?? ''),
            ];
        }

        return $this->recommendedActionShape();
    }

    /**
     * Legacy rows only have a flat `recommended_action` string — split it on an em-dash
     * (the format written by newer rows: "{title} — {detail}") or fall back to the first
     * sentence as the title.
     *
     * @return array{title: string, detail: string}
     */
    private function splitLegacyAction(string $flat): array
    {
        $flat = trim($flat);
        if ($flat === '') {
            return ['title' => '', 'detail' => ''];
        }

        if (str_contains($flat, ' — ')) {
            [$title, $detail] = explode(' — ', $flat, 2);

            return ['title' => trim($title), 'detail' => trim($detail)];
        }

        $sentenceEnd = mb_strpos($flat, '. ');
        if ($sentenceEnd !== false) {
            return [
                'title' => trim(mb_substr($flat, 0, $sentenceEnd + 1)),
                'detail' => trim(mb_substr($flat, $sentenceEnd + 2)),
            ];
        }

        return ['title' => $flat, 'detail' => ''];
    }
}
