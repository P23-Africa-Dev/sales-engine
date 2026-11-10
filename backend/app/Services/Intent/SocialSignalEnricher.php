<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
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
     * @param  ?SignalTypeDefinition  $signalType  When the hit was found via a dedicated Stage 2
     *                                             signal-type query (see SocialListeningOrchestrator::
     *                                             buildSignalTypeQueries), the matched definition —
     *                                             sharpens extraction toward that type's own trigger
     *                                             pattern and, for types that name a person
     *                                             (feeds_enrichment), toward pulling out named_people
     *                                             precisely so Stage 3 has something real to enrich.
     *                                             Null for the default/general query path — behavior
     *                                             there is unchanged except for the new named_people key.
     * @return array<string, mixed>
     */
    public function enrich(
        Organization $organization,
        IcpProfile $icp,
        RawSocialHit $hit,
        ?SignalTypeDefinition $signalType = null,
        ?ListeningProfile $profile = null,
    ): array {
        $brief = IcpBrief::fromIcpProfile($icp);

        if ($this->glm->isConfigured()) {
            try {
                $json = $this->glm->chatJson(
                    $this->messages($brief, $hit, $signalType, $profile),
                    'extract',
                    $organization,
                );

                return $this->fromModel($json, $hit, $brief);
            } catch (\Throwable) {
                // fall through to heuristic enrichment
            }
        }

        return $this->heuristicEnrich($hit, $brief);
    }

    /**
     * Enrich many posts with concurrent model calls. One serial call per post
     * was what capped a run at a dozen candidates; pooling lets a run judge
     * every candidate that survives the prefilter.
     *
     * @param  array<int|string, array{hit: RawSocialHit, signalType: ?SignalTypeDefinition}>  $items
     * @return array<int|string, array<string, mixed>> Same keys as $items.
     */
    public function enrichMany(
        Organization $organization,
        IcpProfile $icp,
        array $items,
        ?ListeningProfile $profile = null,
        int $concurrency = 6,
    ): array {
        $brief = IcpBrief::fromIcpProfile($icp);
        $out = [];

        if (! $this->glm->isConfigured()) {
            foreach ($items as $key => $item) {
                $out[$key] = $this->heuristicEnrich($item['hit'], $brief);
            }

            return $out;
        }

        foreach (array_chunk($items, max(1, $concurrency), true) as $chunk) {
            $requests = [];
            foreach ($chunk as $key => $item) {
                $requests[$key] = [
                    'messages' => $this->messages($brief, $item['hit'], $item['signalType'] ?? null, $profile),
                ];
            }

            try {
                $responses = $this->glm->chatJsonPool($requests, 'extract', $organization);
            } catch (\Throwable) {
                $responses = [];
            }

            foreach ($chunk as $key => $item) {
                $json = $responses[$key] ?? null;
                $out[$key] = is_array($json)
                    ? $this->fromModel($json, $item['hit'], $brief)
                    : $this->heuristicEnrich($item['hit'], $brief);
            }
        }

        return $out;
    }

    /**
     * @return list<array{role: string, content: string}>
     */
    private function messages(IcpBrief $brief, RawSocialHit $hit, ?SignalTypeDefinition $signalType, ?ListeningProfile $profile): array
    {
        $systemPrompt = 'You qualify one public social post for a specific user and, when it is a real opening, write the dossier they will act on. '
            .'Be strict: the user pays for openings, not for content. Most posts are NOT openings — vendors advertising, consultants posting tips, news, job ads, people sharing opinions with no need. '
            .'Return JSON only with keys: author_role, opportunity_kind, profile_name, persona, company_name, location_text, entity_type, industry, key_topics, competitors, '
            .'signal_type, buying_stage, intent_label, intent_description, problem, urgency, buying_intent_score, reasons, suggested_message, recommended_action_title, recommended_action_detail, follow_up_strategy, '
            .'summary, why_this_matters_to_you, benefits, personal_recommended_action_title, personal_recommended_action_detail, named_people, evidence_quote, actionability. '
            .'author_role is exactly one of: buyer (has the need or is choosing a product/service/provider), founder (raising money or seeking partners for their own company), vendor (selling or promoting their own offer), recruiter (job ad), news (journalist, media, or reposted announcement), other. '
            .'opportunity_kind is exactly one of: asking_for_recommendation, competitor_dissatisfaction, pain_point (describes the problem without asking for a product), pricing_question, funding, partnership, hiring, none. '
            .'buying_stage MUST be exactly one of: Awareness, Consideration, Vendor Evaluation, Decision. '
            .'signal_type MUST be exactly one of: recommendation, switching, pricing, hiring_expansion, investment_opportunity, market_signal, partnership_opportunity, competitive_move, funding_event, regulatory_change, other. '
            .'Map opportunity_kind to signal_type: asking_for_recommendation and pain_point -> recommendation, competitor_dissatisfaction -> switching, pricing_question -> pricing, funding -> funding_event, partnership -> partnership_opportunity, hiring -> hiring_expansion, none -> other. '
            .'buying_intent_score (0-100 integer) answers: how likely is it that the user wins business or a deal by replying this week? '
            .'90+ = explicitly asking for exactly what the user offers, in their market; 70-89 = clear need the offer solves; 50-69 = plausible but indirect; under 40 = not worth their time (use signal_type other). '
            .'If interest.not_a_fit is present, a post whose author or target is one of those is not an opening for this user. '
            .'Score lower when the location or segment clearly contradicts the user\'s interest, when the post is old news, or when the author is not the one with the need. '
            .'reasons is an array of short strings citing what in the post matches the user\'s interest. summary is a concise neutral summary. '
            .'why_this_matters_to_you is 2nd person and cites the user\'s stated interest explicitly. benefits is an array of concrete gains for the user. '
            .'suggested_message is a short, helpful, non-salesy first reply that references the specific post (no placeholders, no "I came across your post"). '
            .'personal_recommended_action_title / _detail is the single best next step for THIS user. '
            .'named_people is an array of full names of real people explicitly named in the post as taking an action; empty array if none. '
            .'evidence_quote is ONE sentence copied verbatim from the post (at least 25 characters) that proves the need, ask, or complaint. '
            .'actionability is exactly "reply_now" or "not_an_opportunity". Use reply_now only when author_role is buyer or founder (or news, for funding/deal tracking) AND that quoted sentence is a concrete opening the user can act on this week. '
            .'Every field must be populated (use empty string/array rather than omitting a key).';

        if ($signalType !== null) {
            $systemPrompt .= " This post was found via a dedicated search for the \"{$signalType->label}\" signal type: {$signalType->trigger_description} "
                .'If the post genuinely does not match that trigger pattern on closer reading, say so honestly — set signal_type to the best-fitting type anyway (or "other") and explain the mismatch in intent_description. Do not force a fit.';

            if ($signalType->feeds_enrichment) {
                $systemPrompt .= ' This signal type is expected to name a real person (e.g. a new hire or appointee) — extract every such name into named_people as precisely as possible; this is used to look up their contact details next.';
            }
        }

        $interest = [
            'description' => $brief->description,
            'custom_prompt' => $brief->customPrompt,
            'industries' => $brief->industries,
            'territories' => $brief->territories,
        ];
        if ($profile !== null) {
            $interest['looking_for'] = $profile->mode;
            $interest['offer'] = $profile->offer;
            $interest['offer_synonyms'] = $profile->synonyms;
            $interest['competitors'] = $profile->competitors;
            if ($profile->buyer !== '') {
                $interest['ideal_opening'] = $profile->buyer;
            }
            if ($profile->avoid !== []) {
                // Who the user said is NOT a fit. A post whose author or subject
                // is one of these is not an opening (actionability not_an_opportunity).
                $interest['not_a_fit'] = $profile->avoid;
            }
        }

        return [
            ['role' => 'system', 'content' => $systemPrompt],
            [
                'role' => 'user',
                'content' => (string) json_encode([
                    'interest' => $interest,
                    'post' => mb_substr($hit->postText, 0, 4000),
                    'title' => $hit->title,
                    'platform' => $hit->platform,
                    'url' => $hit->postUrl,
                    'author' => $hit->authorName,
                    'posted_at' => $hit->postedAt?->toIso8601String(),
                    'date_raw' => $hit->dateRaw,
                ]),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $json
     * @return array<string, mixed>
     */
    private function fromModel(array $json, RawSocialHit $hit, IcpBrief $brief): array
    {
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

        $kind = mb_strtolower(trim((string) ($json['opportunity_kind'] ?? '')));
        $intentLabel = $kind === 'pain_point' && $signalType === 'recommendation'
            ? 'Pain Point'
            : $this->intentLabelForType($signalType, (string) ($json['intent_label'] ?? ''));
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
            'author_role' => mb_strtolower(trim((string) ($json['author_role'] ?? ''))),
            'opportunity_kind' => $kind,
            'evidence_quote' => trim((string) ($json['evidence_quote'] ?? '')),
            'actionability' => ($json['actionability'] ?? '') === 'reply_now' ? 'reply_now' : 'not_an_opportunity',
            'intent_label' => $intentLabel,
            'entity_type' => $entityType,
            'score' => $score,
            'reasons' => $json['reasons'] ?? ['Public post indicates research or need matching the active ICP.'],
            'key_topics' => $this->stringList($json['key_topics'] ?? [], 4),
            'competitors' => $this->stringList($json['competitors'] ?? [], 3),
            'benefits' => $this->stringList($json['benefits'] ?? [], 5),
            'named_people' => $this->stringList($json['named_people'] ?? [], 5),
            'recommended_action_title' => $actionTitle,
            'recommended_action_detail' => $actionDetail,
            'recommended_action' => $this->joinAction($actionTitle, $actionDetail),
            'personal_recommended_action_title' => $personalActionTitle,
            'personal_recommended_action_detail' => $personalActionDetail,
            'why_this_matters_to_you' => (string) ($json['why_this_matters_to_you'] ?? $this->fallbackWhyThisMatters($brief, $signalType)),
            'summary' => (string) ($json['summary'] ?? mb_substr($hit->postText, 0, 240)),
            'author_profile_url' => $hit->authorProfileUrl,
            'profile_name' => trim((string) ($json['profile_name'] ?? '')) !== ''
                ? (string) $json['profile_name']
                : ($hit->authorName ?? 'Unknown'),
        ]);
    }

    private function extractIndustryFromHit(RawSocialHit $hit): string
    {
        $text = $hit->postText.' '.$hit->title.' '.$hit->snippet;
        if (preg_match('/\b(FMCG|FinTech|fintech|SaaS|textile|logistics|pharma|healthcare|manufacturing)\b/u', $text, $match)) {
            return $match[1];
        }

        return '';
    }

    private function extractLocationFromHit(RawSocialHit $hit): string
    {
        $text = $hit->postText.' '.$hit->title.' '.$hit->snippet;
        if (preg_match('/\b(Lagos|Nairobi|Kenya|Nigeria|Africa|London|Accra|Cairo)\b/u', $text, $match)) {
            return $match[1];
        }

        return '';
    }

    /**
     * @return array<string, mixed>
     */
    private function heuristicEnrich(RawSocialHit $hit, IcpBrief $brief): array
    {
        $signalType = $this->normalizeSignalType('', '', $hit->postText, $brief);
        $score = $this->resolveScore(null, $signalType, $hit->postText, $brief);
        $actionTitle = 'Reach out soon';
        $actionDetail = 'This prospect may be actively looking for solutions. A timely reply increases response odds.';

        return [
            'profile_name' => $hit->authorName ?? 'Unknown',
            'author_profile_url' => $hit->authorProfileUrl,
            'persona' => $hit->authorName !== null && trim($hit->authorName) !== '' ? 'Poster' : 'Unknown',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'industry' => $this->extractIndustryFromHit($hit),
            'key_topics' => [],
            'competitors' => [],
            'location_text' => $this->extractLocationFromHit($hit),
            'signal_type' => $signalType,
            'buying_stage' => 'Consideration',
            'intent_label' => $this->intentLabelForType($signalType, ''),
            'intent_description' => 'Potential opportunity detected',
            'problem' => mb_substr($hit->postText, 0, 120),
            'urgency' => 'Medium',
            'reasons' => [
                'Public post indicates active research or need',
            ],
            'suggested_message' => "Hi,\n\nI came across your post and thought we might be able to help. Would you be open to a brief conversation?",
            'recommended_action_title' => $actionTitle,
            'recommended_action_detail' => $actionDetail,
            'recommended_action' => $this->joinAction($actionTitle, $actionDetail),
            'follow_up_strategy' => '',
            'summary' => mb_substr($hit->postText, 0, 240),
            'why_this_matters_to_you' => $this->fallbackWhyThisMatters($brief, $signalType),
            'benefits' => [],
            'named_people' => [],
            'personal_recommended_action_title' => $actionTitle,
            'personal_recommended_action_detail' => $actionDetail,
            'score' => $score,
            'evidence_quote' => '',
            'actionability' => 'not_an_opportunity',
            'from_heuristic' => true,
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

        return "{$title}. {$detail}";
    }

    /**
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

        // "expansion" alone is ambiguous (market expansion ≠ hiring). Only keep the hiring
        // alias when the label clearly means recruiting.
        if ($normalized === 'expansion' || $normalized === 'expanding') {
            $probe = mb_strtolower(trim($intentLabel.' '.$postText));
            if (preg_match('/\b(hiring|hire|recruit|job|vacancy|headcount|open role|we.?re hiring)\b/u', $probe)) {
                return 'hiring_expansion';
            }

            return 'market_signal';
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

        if (preg_match('/\b(partnership|collaborat|joint venture|alliance|invitation to .+ companies)\b/u', $haystack)) {
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

        // Hiring only when recruiting language is present — NOT bare "expand/expansion"
        // (those are market/growth signals, e.g. "expand their footprint").
        if (preg_match('/\b(hiring|hire|recruit|job opening|job post|vacancy|headcount|open roles?|we.?re hiring|looking for a .*(manager|director|engineer|rep|sdr|ae))\b/u', $haystack)) {
            return 'hiring_expansion';
        }

        if (preg_match('/\b(expand(ing|s)?(\s+\w+){0,2}\s+(footprint|into|operations|presence|market)|market expansion|geographic expansion|enter(ing)? (the )?market)\b/u', $haystack)) {
            return 'market_signal';
        }

        if (preg_match('/\b(recommend|recommendation|looking for|any tool|vendor|software|solution|suggest)\b/u', $haystack)) {
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
