<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;

class SocialSignalEnricher
{
    /** Backward-compatible sales-outreach types. */
    public const SALES_SIGNAL_TYPES = [
        'recommendation',
        'switching',
        'pricing',
        'hiring_expansion',
    ];

    /** New opportunity types for the personal-assistant framing (Layer B). */
    public const OPPORTUNITY_SIGNAL_TYPES = [
        'investment_opportunity',
        'market_signal',
        'partnership_opportunity',
        'competitive_move',
        'funding_event',
        'regulatory_change',
    ];

    public const CANONICAL_SIGNAL_TYPES = [
        ...self::SALES_SIGNAL_TYPES,
        ...self::OPPORTUNITY_SIGNAL_TYPES,
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
                        'content' => 'Extract a structured opportunity from a social post for a specific viewing user, grounded in their ICP / stated interests. '
                            .'Return JSON only with keys: profile_name, persona, company_name, location_text, entity_type, industry, key_topics, competitors, '
                            .'signal_type, buying_stage, intent_label, intent_description, problem, urgency, buying_intent_score (0-100 integer for overall relevance/opportunity strength for this user), '
                            .'reasons (array of strings citing ICP/interest match when applicable), suggested_message, recommended_action_title, recommended_action_detail, follow_up_strategy, '
                            .'summary (concise neutral summary of the signal), why_this_matters_to_you (2nd person, cite the user\'s ICP/interest fields explicitly), '
                            .'benefits (array of concrete personal/user gains), personal_recommended_action_title, personal_recommended_action_detail (the single best next step for THIS user). '
                            .'signal_type MUST be exactly one of: recommendation, switching, pricing, hiring_expansion, investment_opportunity, market_signal, partnership_opportunity, competitive_move, funding_event, regulatory_change, other. '
                            .'Use investment_opportunity/funding_event for funding rounds, capital raises, or investable openings. Use market_signal for market shifts, expansions, or trend news relevant to the user\'s interests. '
                            .'Use partnership_opportunity for potential collaborations. Use competitive_move for competitor actions worth knowing about. Use regulatory_change for policy/regulatory news. '
                            .'Use hiring_expansion for hiring/recruiting/expansion posts. Use recommendation/switching/pricing when the author is asking for vendors, alternatives, costs, or tools. '
                            .'Use other only for content with no plausible relevance to the user\'s ICP/interests, or spam. Do not force unrelated content into a sales bucket — pick the type that best matches WHY this matters to the user. '
                            .'Every field must be populated (use empty string/array rather than omitting a key).',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'icp' => [
                                'name' => $brief->name,
                                'description' => $brief->description,
                                'industries' => $brief->industries,
                                'territories' => $brief->territories,
                                'company_sizes' => $brief->companySizes,
                                'decision_makers' => $brief->decisionMakers,
                                'custom_prompt' => $brief->customPrompt,
                                'min_match_score' => $brief->minMatchScore,
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
                    $brief,
                );

                $score = $this->resolveScore(
                    $json['buying_intent_score'] ?? null,
                    $signalType,
                    $hit->postText,
                    $brief,
                );

                $intentLabel = $this->intentLabelForType($signalType, (string) ($json['intent_label'] ?? ''));
                $entityType = $this->normalizeEntityType((string) ($json['entity_type'] ?? ''), (string) ($json['company_name'] ?? ''));
                [$actionTitle, $actionDetail] = $this->splitAction(
                    (string) ($json['recommended_action_title'] ?? ''),
                    (string) ($json['recommended_action_detail'] ?? ''),
                );
                [$personalActionTitle, $personalActionDetail] = $this->splitAction(
                    (string) ($json['personal_recommended_action_title'] ?? ''),
                    (string) ($json['personal_recommended_action_detail'] ?? ''),
                    $actionTitle,
                    $actionDetail,
                );

                return array_merge($json, [
                    'signal_type' => $signalType,
                    'intent_label' => $intentLabel,
                    'entity_type' => $entityType,
                    'score' => $score,
                    'reasons' => $json['reasons'] ?? ['Public post indicates research or need matching the active ICP.'],
                    'key_topics' => $this->stringList($json['key_topics'] ?? [], 4),
                    'competitors' => $this->stringList($json['competitors'] ?? [], 3),
                    'benefits' => $this->stringList($json['benefits'] ?? [], 5),
                    'recommended_action_title' => $actionTitle,
                    'recommended_action_detail' => $actionDetail,
                    'recommended_action' => $this->joinAction($actionTitle, $actionDetail),
                    'personal_recommended_action_title' => $personalActionTitle,
                    'personal_recommended_action_detail' => $personalActionDetail,
                    'why_this_matters_to_you' => (string) ($json['why_this_matters_to_you'] ?? $this->fallbackWhyThisMatters($brief, $signalType)),
                    'summary' => (string) ($json['summary'] ?? mb_substr($hit->postText, 0, 240)),
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
        $signalType = $this->normalizeSignalType('', '', $hit->postText, $brief);
        $score = $this->resolveScore(null, $signalType, $hit->postText, $brief);
        $actionTitle = 'Reach out soon';
        $actionDetail = 'This prospect may be actively looking for solutions — a timely reply increases response odds.';

        return [
            'profile_name' => $hit->authorName ?? 'Unknown',
            'persona' => $brief->decisionMakers[0] ?? 'Decision maker',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'industry' => $brief->industries[0] ?? '',
            'key_topics' => [],
            'competitors' => [],
            'location_text' => $brief->territories[0] ?? '',
            'signal_type' => $signalType,
            'buying_stage' => 'Consideration',
            'intent_label' => $this->intentLabelForType($signalType, ''),
            'intent_description' => 'Potential opportunity detected',
            'problem' => mb_substr($hit->postText, 0, 120),
            'urgency' => 'Medium',
            'reasons' => [
                'Public post indicates active research or need',
                'Matches ICP context (industry / territory / interests when present)',
            ],
            'suggested_message' => "Hi,\n\nI came across your post and thought we might be able to help. Would you be open to a brief conversation?",
            'recommended_action_title' => $actionTitle,
            'recommended_action_detail' => $actionDetail,
            'recommended_action' => $this->joinAction($actionTitle, $actionDetail),
            'follow_up_strategy' => '',
            'summary' => mb_substr($hit->postText, 0, 240),
            'why_this_matters_to_you' => $this->fallbackWhyThisMatters($brief, $signalType),
            'benefits' => [],
            'personal_recommended_action_title' => $actionTitle,
            'personal_recommended_action_detail' => $actionDetail,
            'score' => $score,
        ];
    }

    private function fallbackWhyThisMatters(IcpBrief $brief, string $signalType): string
    {
        $interest = trim($brief->customPrompt) !== '' ? $brief->customPrompt : ($brief->description !== '' ? $brief->description : 'your stated interests');

        return match ($signalType) {
            'investment_opportunity', 'funding_event' => "This looks like an investable opportunity aligned with {$interest}.",
            'market_signal' => "This market move is relevant to what you're tracking: {$interest}.",
            'partnership_opportunity' => "This could be a partnership worth exploring given {$interest}.",
            'competitive_move' => "A competitor or adjacent player is moving in a way that matters for {$interest}.",
            'regulatory_change' => "This regulatory update may affect plans tied to {$interest}.",
            default => "This matches what you're looking for based on {$interest}.",
        };
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function splitAction(string $title, string $detail, ?string $fallbackTitle = null, ?string $fallbackDetail = null): array
    {
        $title = trim($title);
        $detail = trim($detail);

        if ($title === '' && $detail === '') {
            return [$fallbackTitle ?? '', $fallbackDetail ?? ''];
        }

        if ($title === '') {
            $title = mb_substr($detail, 0, 60);
        }

        return [$title, $detail];
    }

    private function joinAction(string $title, string $detail): string
    {
        if ($title === '' && $detail === '') {
            return '';
        }
        if ($title === '') {
            return $detail;
        }
        if ($detail === '') {
            return $title;
        }

        return "{$title} — {$detail}";
    }

    /**
     * @param  mixed  $value
     * @return list<string>
     */
    private function stringList(mixed $value, int $limit): array
    {
        if (! is_array($value)) {
            return [];
        }

        $items = array_values(array_filter(array_map(
            static fn ($item) => trim((string) $item),
            $value
        ), static fn ($item) => $item !== ''));

        return array_slice($items, 0, $limit);
    }

    public function normalizeSignalType(string $signalType, string $intentLabel = '', string $postText = '', ?IcpBrief $brief = null): string
    {
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
            'investment_opportunity' => 'investment_opportunity',
            'investment' => 'investment_opportunity',
            'funding_event' => 'funding_event',
            'funding' => 'funding_event',
            'fundraise' => 'funding_event',
            'market_signal' => 'market_signal',
            'market' => 'market_signal',
            'partnership_opportunity' => 'partnership_opportunity',
            'partnership' => 'partnership_opportunity',
            'competitive_move' => 'competitive_move',
            'competitor' => 'competitive_move',
            'regulatory_change' => 'regulatory_change',
            'regulatory' => 'regulatory_change',
            'regulation' => 'regulatory_change',
        ];

        if (isset($aliases[$normalized])) {
            return $aliases[$normalized];
        }

        if (in_array($normalized, self::CANONICAL_SIGNAL_TYPES, true)) {
            return $normalized;
        }

        $haystack = mb_strtolower(trim($signalType.' '.$intentLabel.' '.$postText));

        if ($haystack === '') {
            return 'other';
        }

        // ICP interest language takes priority: if the user's custom prompt / description
        // signals a non-sales focus (e.g. investing), classify opportunity-shaped content
        // into that bucket instead of defaulting to sales buckets or discarding it.
        $interest = $brief !== null ? mb_strtolower(trim($brief->customPrompt.' '.$brief->description)) : '';

        if (preg_match('/\b(raises?|raised|funding round|series [a-e]|seed round|venture capital|invest(or|ment|ing)?)\b/u', $haystack)) {
            return 'funding_event';
        }

        if (preg_match('/\b(partnership|collaborat|joint venture|alliance)\b/u', $haystack)) {
            return 'partnership_opportunity';
        }

        if (preg_match('/\b(regulation|regulatory|policy change|compliance mandate|law(s)? (require|mandate))\b/u', $haystack)) {
            return 'regulatory_change';
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

        if ($interest !== '' && preg_match('/\b(market|expansion|launch(es|ed)?|growth|opportunity)\b/u', $haystack)) {
            return 'market_signal';
        }

        if ($interest !== '' && preg_match('/\b(competitor|rival|rebrand|acqui(re|sition))\b/u', $haystack)) {
            return 'competitive_move';
        }

        return 'other';
    }

    public function normalizeEntityType(string $entityType, string $companyName = ''): string
    {
        $entityType = mb_strtolower(trim($entityType));
        if (in_array($entityType, ['company', 'individual'], true)) {
            return $entityType;
        }

        $companyName = trim($companyName);

        return ($companyName === '' || mb_strtolower($companyName) === 'individual') ? 'individual' : 'company';
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
                'funding_event', 'investment_opportunity' => 65.0,
                'market_signal', 'partnership_opportunity', 'competitive_move' => 60.0,
                'regulatory_change' => 55.0,
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

        // Reward matches against the user's own stated interest language (customPrompt/description) —
        // this is what lets non-sales opportunity types (investment, market, partnership) score well
        // instead of being treated as low-value "other" noise.
        $interestTokens = $this->interestTokens($brief);
        foreach ($interestTokens as $token) {
            if ($token !== '' && mb_strlen($token) >= 4 && str_contains($text, $token)) {
                $base = min(95, $base + 10);
                break;
            }
        }

        if ($signalType === 'other') {
            $base = min($base, 48.0);
        }

        return max(0, min(95, round($base, 1)));
    }

    /**
     * @return list<string>
     */
    private function interestTokens(IcpBrief $brief): array
    {
        $raw = mb_strtolower(trim($brief->customPrompt.' '.$brief->description));
        if ($raw === '') {
            return [];
        }

        $words = preg_split('/[^\p{L}\p{N}]+/u', $raw) ?: [];
        $stopwords = ['the', 'and', 'for', 'with', 'that', 'this', 'from', 'want', 'looking', 'high', 'outside', 'home', 'market'];

        return array_values(array_filter($words, static fn ($w) => mb_strlen($w) >= 4 && ! in_array($w, $stopwords, true)));
    }

    private function intentLabelForType(string $signalType, string $fallback): string
    {
        return match ($signalType) {
            'switching' => 'Switching',
            'pricing' => 'Price',
            'hiring_expansion' => 'Hiring / Expansion',
            'recommendation' => 'Recommendation',
            'investment_opportunity' => 'Investment Opportunity',
            'funding_event' => 'Funding Event',
            'market_signal' => 'Market Signal',
            'partnership_opportunity' => 'Partnership Opportunity',
            'competitive_move' => 'Competitive Move',
            'regulatory_change' => 'Regulatory Change',
            default => $fallback !== '' ? $fallback : 'Other',
        };
    }

    public static function intentColor(string $intentLabel): string
    {
        return match (mb_strtolower($intentLabel)) {
            'switching' => '#f8725d',
            'price', 'pricing' => '#67b7f4',
            'hiring / expansion', 'hiring', 'expansion' => '#a78bfa',
            'investment opportunity', 'funding event' => '#f5a524',
            'market signal' => '#22c3a6',
            'partnership opportunity' => '#818cf8',
            'competitive move' => '#f43f5e',
            'regulatory change' => '#94a3b8',
            default => '#6ec758',
        };
    }
}
