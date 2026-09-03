<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;

class SocialSignalEnricher
{
    public const CANONICAL_SIGNAL_TYPES = [
        'recommendation',
        'switching',
        'pricing',
        'hiring_expansion',
    ];

    public function __construct(
        private readonly GlmClient $glm,
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
                        'content' => 'Extract structured B2B sales intent from a social post. Return JSON only with keys: profile_name, persona, company_name, location_text, signal_type, buying_stage, intent_label, intent_description, problem, urgency, buying_intent_score (0-100 integer for how strongly this post shows active buying/research intent), reasons (array of strings citing ICP match when applicable), suggested_message, recommended_action. '
                            .'signal_type MUST be exactly one of: recommendation, switching, pricing, hiring_expansion, other. '
                            .'Use hiring_expansion for hiring/recruiting/expansion posts. Use other for unrelated content, pure thought-leadership with no need, or spam. '
                            .'Prefer recommendation/switching/pricing when the author is asking for vendors, alternatives, costs, or tools.',
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
                            'title' => $hit->title,
                            'platform' => $hit->platform,
                            'url' => $hit->postUrl,
                        ]),
                    ],
                ], 'extract', $organization);

                $signalType = $this->normalizeSignalType(
                    (string) ($json['signal_type'] ?? ''),
                    (string) ($json['intent_label'] ?? ''),
                    $hit->postText,
                );

                $score = $this->resolveScore(
                    $json['buying_intent_score'] ?? null,
                    $signalType,
                    $hit->postText,
                    $brief,
                );

                $intentLabel = $this->intentLabelForType($signalType, (string) ($json['intent_label'] ?? ''));

                return array_merge($json, [
                    'signal_type' => $signalType,
                    'intent_label' => $intentLabel,
                    'score' => $score,
                    'reasons' => $json['reasons'] ?? ['Public post indicates research or need matching the active ICP.'],
                ]);
            } catch (\Throwable) {
                // fall through to heuristic enrichment
            }
        }

        return $this->heuristicEnrich($hit, $brief);
    }

    /**
     * @return array<string, mixed>
     */
    private function heuristicEnrich(RawSocialHit $hit, IcpBrief $brief): array
    {
        $signalType = $this->normalizeSignalType('', '', $hit->postText);
        $score = $this->resolveScore(null, $signalType, $hit->postText, $brief);

        return [
            'profile_name' => $hit->authorName ?? 'Unknown',
            'persona' => $brief->decisionMakers[0] ?? 'Decision maker',
            'company_name' => 'Individual',
            'location_text' => $brief->territories[0] ?? '',
            'signal_type' => $signalType,
            'buying_stage' => 'Consideration',
            'intent_label' => $this->intentLabelForType($signalType, ''),
            'intent_description' => 'Potential buying signal detected',
            'problem' => mb_substr($hit->postText, 0, 120),
            'urgency' => 'Medium',
            'reasons' => [
                'Public post indicates active research or need',
                'Matches ICP context (industry / territory keywords when present)',
            ],
            'suggested_message' => "Hi,\n\nI came across your post and thought we might be able to help. Would you be open to a brief conversation?",
            'recommended_action' => 'Reach out within 24 hours — this prospect may be actively looking for solutions.',
            'score' => $score,
        ];
    }

    public function normalizeSignalType(string $signalType, string $intentLabel = '', string $postText = ''): string
    {
        $haystack = mb_strtolower(trim($signalType.' '.$intentLabel.' '.$postText));

        if ($haystack === '') {
            return 'other';
        }

        if (preg_match('/\b(switch|switching|alternative|replace|migrat)/u', $haystack)) {
            return 'switching';
        }

        if (preg_match('/\b(price|pricing|cost|budget|how much|quote|afford)/u', $haystack)) {
            return 'pricing';
        }

        if (preg_match('/\b(hiring|hire|recruit|job|vacancy|expansion|expanding|headcount|we.?re looking for)/u', $haystack)) {
            return 'hiring_expansion';
        }

        if (preg_match('/\b(recommend|recommendation|looking for|any tool|vendor|software|solution|suggest)/u', $haystack)) {
            return 'recommendation';
        }

        $normalized = mb_strtolower(trim($signalType));
        $aliases = [
            'recommendation' => 'recommendation',
            'recommendations' => 'recommendation',
            'switching' => 'switching',
            'switch' => 'switching',
            'price' => 'pricing',
            'pricing' => 'pricing',
            'hiring' => 'hiring_expansion',
            'hiring_expansion' => 'hiring_expansion',
            'expansion' => 'hiring_expansion',
            'job post' => 'hiring_expansion',
            'job posting' => 'hiring_expansion',
            'job opening' => 'hiring_expansion',
            'job application' => 'hiring_expansion',
        ];

        if (isset($aliases[$normalized])) {
            return $aliases[$normalized];
        }

        return in_array($normalized, self::CANONICAL_SIGNAL_TYPES, true) ? $normalized : 'other';
    }

    private function resolveScore(mixed $buyingIntentScore, string $signalType, string $postText, IcpBrief $brief): float
    {
        $base = is_numeric($buyingIntentScore) ? (float) $buyingIntentScore : null;

        if ($base === null || $base <= 0) {
            $base = match ($signalType) {
                'switching' => 72.0,
                'pricing' => 70.0,
                'recommendation' => 68.0,
                'hiring_expansion' => 62.0,
                default => 45.0,
            };
        }

        $text = mb_strtolower($postText);
        foreach ($brief->industries as $industry) {
            $token = mb_strtolower(trim((string) $industry));
            if ($token !== '' && mb_strlen($token) >= 3 && str_contains($text, $token)) {
                $base = min(95, $base + 8);
                break;
            }
        }

        foreach ($brief->territories as $territory) {
            $parts = preg_split('/[,\s]+/u', mb_strtolower((string) $territory)) ?: [];
            foreach ($parts as $part) {
                if (mb_strlen($part) >= 4 && str_contains($text, $part)) {
                    $base = min(95, $base + 5);
                    break 2;
                }
            }
        }

        if ($signalType === 'other') {
            $base = min($base, 48.0);
        }

        return max(0, min(95, round($base, 1)));
    }

    private function intentLabelForType(string $signalType, string $fallback): string
    {
        return match ($signalType) {
            'switching' => 'Switching',
            'pricing' => 'Price',
            'hiring_expansion' => 'Hiring / Expansion',
            'recommendation' => 'Recommendation',
            default => $fallback !== '' ? $fallback : 'Other',
        };
    }

    public static function intentColor(string $intentLabel): string
    {
        return match (mb_strtolower($intentLabel)) {
            'switching' => '#f8725d',
            'price', 'pricing' => '#67b7f4',
            'hiring / expansion', 'hiring', 'expansion' => '#a78bfa',
            default => '#6ec758',
        };
    }
}
