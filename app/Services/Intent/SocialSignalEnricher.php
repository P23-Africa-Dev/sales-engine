<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;
use App\Services\Scoring\ScoringService;

class SocialSignalEnricher
{
    public function __construct(
        private readonly GlmClient $glm,
        private readonly ScoringService $scoring,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function enrich(
        Organization $organization,
        IcpProfile $icp,
        RawSocialHit $hit,
    ): array {
        $brief = IcpBrief::fromIcpProfile($icp);

        if ($this->glm->isConfigured()) {
            try {
                $json = $this->glm->chatJson([
                    [
                        'role' => 'system',
                        'content' => 'Extract structured B2B sales intent from a social post. Return JSON only with keys: profile_name, persona, company_name, location_text, signal_type, buying_stage, intent_label, intent_description, problem, urgency, reasons (array of strings citing ICP match when applicable), suggested_message, recommended_action.',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'icp' => [
                                'name' => $brief->name,
                                'industries' => $brief->industries,
                                'territories' => $brief->territories,
                                'company_sizes' => $brief->companySizes,
                                'decision_makers' => $brief->decisionMakers,
                            ],
                            'post' => $hit->postText,
                            'platform' => $hit->platform,
                            'url' => $hit->postUrl,
                        ]),
                    ],
                ], 'extract', $organization);

                $scores = $this->scoring->score([
                    'name' => (string) ($json['company_name'] ?? 'Unknown'),
                    'summary' => $hit->postText,
                    'sector' => $brief->industries[0] ?? null,
                    'location' => $json['location_text'] ?? $brief->territories[0] ?? null,
                ], $brief, $organization);

                return array_merge($json, [
                    'score' => $scores['priority_score'],
                    'reasons' => $json['reasons'] ?? [$scores['rationale']],
                ]);
            } catch (\Throwable) {
                // fall through to heuristic enrichment
            }
        }

        return $this->heuristicEnrich($organization, $hit, $brief);
    }

    /**
     * @return array<string, mixed>
     */
    private function heuristicEnrich(Organization $organization, RawSocialHit $hit, IcpBrief $brief): array
    {
        $text = mb_strtolower($hit->postText);
        $signalType = 'Recommendation';
        $intentLabel = 'Recommendation';
        if (str_contains($text, 'switch') || str_contains($text, 'alternative')) {
            $signalType = 'Switching';
            $intentLabel = 'Switching';
        } elseif (str_contains($text, 'cost') || str_contains($text, 'price') || str_contains($text, 'how much')) {
            $signalType = 'Price';
            $intentLabel = 'Price';
        }

        $scores = $this->scoring->score([
            'name' => 'Unknown',
            'summary' => $hit->postText,
            'sector' => $brief->industries[0] ?? null,
            'location' => $brief->territories[0] ?? null,
        ], $brief, $organization);

        return [
            'profile_name' => $hit->authorName ?? 'Unknown',
            'persona' => $brief->decisionMakers[0] ?? 'Decision maker',
            'company_name' => 'Individual',
            'location_text' => $brief->territories[0] ?? '',
            'signal_type' => $signalType,
            'buying_stage' => 'Consideration',
            'intent_label' => $intentLabel,
            'intent_description' => 'Potential buying signal detected',
            'problem' => mb_substr($hit->postText, 0, 120),
            'urgency' => 'Medium',
            'reasons' => [
                'Public post indicates active research or need',
                'Matches ICP (Industry, Size, Location)',
            ],
            'suggested_message' => "Hi,\n\nI came across your post and thought we might be able to help. Would you be open to a brief conversation?",
            'recommended_action' => 'Reach out within 24 hours — this prospect may be actively looking for solutions.',
            'score' => max(55, $scores['priority_score']),
        ];
    }

    public static function intentColor(string $intentLabel): string
    {
        return match (mb_strtolower($intentLabel)) {
            'switching' => '#f8725d',
            'price', 'pricing' => '#67b7f4',
            default => '#6ec758',
        };
    }
}
