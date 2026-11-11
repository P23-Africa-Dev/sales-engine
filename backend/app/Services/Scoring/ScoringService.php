<?php

namespace App\Services\Scoring;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use App\Services\Llm\GlmClient;
use App\Support\IcpMeaning;

class ScoringService
{
    /** Candidates per model call when scoring a page. */
    private const SCORE_BATCH_SIZE = 8;

    /** Leads at or above this evidence score are "strong"; below it they are labelled partial matches. */
    public const QUALITY_BAR = 80;

    /** Highest score any lead can show — nothing is a certain buyer. */
    private const SCORE_CEILING = 98.0;

    /** Credit per evidence status. Unknown is not zero: a gap is not a contradiction. */
    private const STATUS_VALUE = [
        'verified' => 1.0,
        'partial' => 0.75,
        'unknown' => 0.4,
        'contradicted' => 0.0,
    ];

    private const SENIOR_TITLE_PATTERN = '/\b(ceo|cto|cfo|coo|cmo|cio|chief|founder|co-founder|owner|president|vp|vice president|director|head of|partner|managing|general manager|principal)\b/iu';

    private const SIGNAL_PATTERN = '/\b(hiring|raised|funding|series [a-d]|seed round|expanding|expansion|launch(?:ed|es|ing)?|new office|partnership|acquired|acquisition|tender|rfp|growing)\b/iu';

    private const INDUSTRY_STOP_WORDS = ['and', 'the', 'services', 'service', 'industry', 'industries', 'other', 'general', 'solutions', 'products', 'companies', 'company'];

    public function __construct(private readonly GlmClient $glm) {}

    /**
     * Fast heuristic score for first-batch discovery (no GLM round-trip).
     *
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string}
     */
    public function heuristicScore(array $companyPayload, IcpBrief $brief): array
    {
        $queryScore = $this->queryRelevanceFor($companyPayload, $brief);
        $evaluation = $this->evaluateEvidence($companyPayload, $brief, $queryScore);

        return $this->scoreRowFromEvaluation($evaluation, $companyPayload, $brief, $queryScore, 'Evidence score (heuristic).', null);
    }

    /**
     * Evidence-based ICP fit. Each ICP dimension the user filled in is checked against what the
     * lead actually shows: verified / partial / unknown / contradicted. Dimensions the ICP leaves
     * empty are not scored, so a lead that matches everything the user asked for reads 90%+.
     *
     * @param  array<string, mixed>  $payload
     * @param  array<string, string>  $modelStatuses  Model judgements per dimension (industry, territory, role).
     * @return array{score: float, breakdown: list<array{dimension: string, label: string, status: string, weight: int, evidence: string}>, has_signal: bool}
     */
    public function evaluateEvidence(array $payload, IcpBrief $brief, float $queryScore, array $modelStatuses = []): array
    {
        $isPerson = $this->isPersonPayload($payload);
        $text = $this->payloadText($payload);
        $hasUserQuery = $brief->hasUserQuery();
        $dimensions = [];

        if ($brief->industries !== []) {
            [$status, $evidence] = $this->industryStatus($payload, $brief, $text);
            $status = $this->mergeModelStatus($status, $modelStatuses['industry'] ?? null, true);
            $dimensions[] = ['dimension' => 'industry', 'label' => 'Industry', 'status' => $status, 'weight' => 30, 'evidence' => $evidence];
        }

        if ($brief->territories !== []) {
            [$status, $evidence] = $this->territoryStatus($payload, $brief);
            // The model may only lift an unknown location to partial; a known wrong country stays wrong.
            $status = $this->mergeModelStatus($status, $modelStatuses['territory'] ?? null, false);
            $dimensions[] = ['dimension' => 'territory', 'label' => 'Location', 'status' => $status, 'weight' => 20, 'evidence' => $evidence];
        }

        if ($isPerson && $brief->decisionMakers !== []) {
            [$status, $evidence] = $this->roleStatus($payload, $brief);
            $status = $this->mergeModelStatus($status, $modelStatuses['role'] ?? null, true);
            $dimensions[] = ['dimension' => 'role', 'label' => 'Role', 'status' => $status, 'weight' => 20, 'evidence' => $evidence];
        }

        if (! $isPerson && ($brief->companySizes !== [] || $brief->revenueRanges !== [])) {
            $sizeValue = trim((string) ($payload['company_size'] ?? $payload['employee_count'] ?? $payload['revenue'] ?? ''));
            // Size data is rarely published; only score it when the lead states it.
            if ($sizeValue !== '') {
                $allowed = array_merge($brief->companySizes, $brief->revenueRanges);
                $status = $this->valueMatchesAllowed($allowed, $sizeValue) ? 'verified' : 'partial';
                $dimensions[] = ['dimension' => 'size', 'label' => 'Size', 'status' => $status, 'weight' => 15, 'evidence' => $sizeValue];
            }
        }

        $relevance = max(0.0, min(1.0, ($queryScore - 45) / 45));
        $relevanceStatus = $relevance >= 0.8 ? 'verified' : ($relevance >= 0.4 ? 'partial' : 'unknown');
        $dimensions[] = [
            'dimension' => 'relevance',
            'label' => $hasUserQuery ? 'Matches your search' : 'Matches your ICP brief',
            'status' => $relevanceStatus,
            'weight' => $hasUserQuery ? 35 : 20,
            'evidence' => '',
            'value' => $relevance,
        ];

        $hasSignal = (bool) preg_match(self::SIGNAL_PATTERN, $text, $signalMatch);
        if ($hasSignal) {
            // Buying signals only ever add evidence; their absence is not held against a lead.
            $dimensions[] = ['dimension' => 'signals', 'label' => 'Buying signal', 'status' => 'verified', 'weight' => 10, 'evidence' => mb_strtolower($signalMatch[0])];
        }

        $earned = 0.0;
        $possible = 0;
        foreach ($dimensions as $dimension) {
            $value = $dimension['value'] ?? self::STATUS_VALUE[$dimension['status']];
            $earned += $dimension['weight'] * $value;
            $possible += $dimension['weight'];
        }

        $score = $possible > 0 ? ($earned / $possible) * 100 : 50.0;
        $score = round(max(0.0, min(self::SCORE_CEILING, $score)), 1);

        $breakdown = array_map(static function (array $dimension): array {
            unset($dimension['value']);

            return $dimension;
        }, $dimensions);

        return ['score' => $score, 'breakdown' => $breakdown, 'has_signal' => $hasSignal];
    }

    /**
     * @param  array{score: float, breakdown: list<array<string, mixed>>, has_signal: bool}  $evaluation
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string, fit_breakdown: list<array<string, mixed>>}
     */
    private function scoreRowFromEvaluation(
        array $evaluation,
        array $companyPayload,
        IcpBrief $brief,
        float $queryScore,
        string $rationale,
        ?string $modelReason,
    ): array {
        $fitScore = $evaluation['score'];
        $fit = $this->assessFirmographicFit($companyPayload, $brief);

        if (
            ! $brief->hasUserQuery()
            && ! $this->isPersonPayload($companyPayload)
            && ! $this->hasIcpEvidence($fit)
            && $this->briefNounOverlap($brief, $companyPayload) === []
        ) {
            // A company row in ICP-brief mode with nothing tying it to the ICP — no matching
            // industry, no confirmed territory, no brief wording — may not be recommended.
            $fitScore = min($fitScore, (float) max(0, $brief->minMatchScore - 1));
        }

        $reason = trim((string) $modelReason);
        if ($reason === '' || $this->reasonClaimsUnverifiedTerritory($reason, $brief, $fit)) {
            $reason = $this->buildIcpRelevanceReason($brief, $fitScore, $brief->isAuthoritativePeopleQuery(), $companyPayload);
        }

        return [
            'icp_fit_score' => $fitScore,
            'intent_score' => $evaluation['has_signal'] ? 70.0 : 45.0,
            // One number everywhere: what the card shows is the evidence score.
            'priority_score' => $fitScore,
            'query_relevance_score' => $queryScore,
            'rationale' => $rationale,
            'icp_relevance_reason' => $reason,
            'fit_breakdown' => $evaluation['breakdown'],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function queryRelevanceFor(array $payload, IcpBrief $brief): float
    {
        $query = $brief->hasUserQuery() ? $brief->cleanedUserQuery() : $brief->searchBrief();
        $score = $this->heuristicQueryRelevance($payload, $query);

        if (! empty($payload['authoritative_source'])) {
            $score = min(95, $score + 15);
        }

        return $score;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string}
     */
    private function industryStatus(array $payload, IcpBrief $brief, string $text): array
    {
        $label = trim((string) ($payload['industry'] ?? $payload['sector'] ?? $payload['company_industry'] ?? ''));
        if ($label !== '' && $this->valueMatchesAllowed($brief->industries, $label)) {
            return ['verified', $label];
        }

        if ($label !== '') {
            // "Rocket SaaS — Marketing Services" mentions SaaS but is an agency: the lead's own
            // industry label decides, a keyword elsewhere in its text does not.
            $labelHit = $this->industryTokenHit($brief->industries, $label);

            return $labelHit !== null ? ['partial', $labelHit] : ['contradicted', $label];
        }

        $tokenHit = $this->industryTokenHit($brief->industries, $text);
        if ($tokenHit !== null) {
            return ['partial', $tokenHit];
        }

        return ['unknown', ''];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string}
     */
    private function territoryStatus(array $payload, IcpBrief $brief): array
    {
        $location = trim((string) ($payload['location'] ?? $payload['territory'] ?? $payload['city'] ?? ''));
        if ($location !== '') {
            return $this->valueMatchesAllowed($brief->territories, $location)
                || app(IcpFilterService::class)->passes($brief, new CandidateCompany(territory: $location), ['territory'])->passed
                ? ['verified', $location]
                : ['contradicted', $location];
        }

        return ['unknown', ''];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string}
     */
    private function roleStatus(array $payload, IcpBrief $brief): array
    {
        $title = trim((string) ($payload['title'] ?? $payload['role'] ?? ''));
        if ($title === '') {
            return ['unknown', ''];
        }

        $titleLower = mb_strtolower($title);
        foreach ($brief->peopleRoleTerms(10) as $role) {
            $roleLower = mb_strtolower($role);
            if (str_contains($titleLower, $roleLower)) {
                return ['verified', $title];
            }
            // "Head of Sales" vs "Sales Director": every meaningful role word appears.
            $words = array_values(array_filter(
                preg_split('/[^\p{L}\p{N}]+/u', $roleLower) ?: [],
                static fn (string $word): bool => mb_strlen($word) >= 3 && ! in_array($word, ['head', 'the', 'and'], true),
            ));
            if ($words !== [] && collect($words)->every(fn (string $word): bool => str_contains($titleLower, $word))) {
                return ['verified', $title];
            }
        }

        if (preg_match(self::SENIOR_TITLE_PATTERN, $title)) {
            return ['partial', $title];
        }

        return ['unknown', $title];
    }

    /**
     * A model judgement may refine a dimension, never invent evidence the fields contradict.
     */
    private function mergeModelStatus(string $heuristic, mixed $model, bool $modelMayDowngrade): string
    {
        if (! is_string($model) || ! isset(self::STATUS_VALUE[$model])) {
            return $heuristic;
        }
        if ($heuristic === 'contradicted' && ! $modelMayDowngrade) {
            return $heuristic;
        }
        if (! $modelMayDowngrade) {
            // Location: the model may only lift unknown → partial.
            return $heuristic === 'unknown' && in_array($model, ['partial', 'verified'], true) ? 'partial' : $heuristic;
        }

        // With no evidence in the lead's own fields, the model may suggest a match but not confirm it.
        if ($heuristic === 'unknown' && $model === 'verified') {
            return 'partial';
        }

        return $model;
    }

    /**
     * @param  list<string>  $industries
     */
    private function industryTokenHit(array $industries, string $text): ?string
    {
        $text = mb_strtolower($text);
        if (trim($text) === '') {
            return null;
        }

        foreach ($industries as $industry) {
            foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower((string) $industry)) ?: [] as $token) {
                if (mb_strlen($token) < 4 || in_array($token, self::INDUSTRY_STOP_WORDS, true)) {
                    continue;
                }
                $stem = mb_substr($token, 0, max(4, mb_strlen($token) - 2));
                if (preg_match('/\b'.preg_quote($stem, '/').'/u', $text)) {
                    return (string) $industry;
                }
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function payloadText(array $payload): string
    {
        return mb_strtolower(implode(' ', array_filter(array_map(
            static fn ($value): string => is_string($value) ? $value : '',
            [
                $payload['name'] ?? null,
                $payload['person_name'] ?? null,
                $payload['company'] ?? null,
                $payload['title'] ?? null,
                $payload['summary'] ?? null,
                $payload['snippet'] ?? null,
                $payload['description'] ?? null,
                $payload['industry'] ?? null,
                $payload['sector'] ?? null,
                $payload['website_summary'] ?? null,
            ],
        ))));
    }

    /**
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string}
     */
    public function score(array $companyPayload, IcpBrief $brief, Organization $organization): array
    {
        $hasUserQuery = $brief->hasUserQuery();
        $isFactualQuery = $brief->isAuthoritativePeopleQuery();

        if (! $this->glm->isConfigured()) {
            return $this->heuristicScore($companyPayload, $brief);
        }

        try {
            $result = $this->glm->chatJson([
                ['role' => 'system', 'content' => $this->scoreSystemPrompt()],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'is_factual_query' => $isFactualQuery,
                        'icp' => $this->icpPromptContext($brief),
                        'company' => $companyPayload,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'score', $organization);

            return $this->applyGlmScoreRow($result, $companyPayload, $brief);
        } catch (\Throwable) {
            // Model unavailable: the evidence heuristic is a real score, not a fixed placeholder.
            return $this->heuristicScore($companyPayload, $brief);
        }
    }

    /**
     * Score a page of candidates with as few model calls as possible: heuristics settle
     * the clear cases, and only the band that straddles minMatchScore is sent to the
     * model, batched and pooled. One call per candidate was the run's time ceiling.
     *
     * @param  array<int, array<string, mixed>>  $payloads
     * @return array<int, array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string}>
     */
    public function scoreBatch(
        array $payloads,
        IcpBrief $brief,
        Organization $organization,
        bool $heuristicOnly = false,
    ): array {
        $scores = [];
        foreach ($payloads as $index => $payload) {
            $scores[$index] = $this->heuristicScore($payload, $brief);
        }

        if ($payloads === [] || $heuristicOnly || ! $this->glm->isConfigured()) {
            return $scores;
        }

        $borderline = [];
        foreach ($payloads as $index => $payload) {
            if ($this->needsModelScore($scores[$index], $brief)) {
                $borderline[$index] = $payload;
            }
        }

        if ($borderline === []) {
            return $scores;
        }

        $isFactualQuery = $brief->isAuthoritativePeopleQuery();
        $chunks = array_chunk($borderline, self::SCORE_BATCH_SIZE, true);
        $requests = [];

        foreach ($chunks as $chunkIndex => $chunk) {
            $leads = [];
            foreach ($chunk as $index => $payload) {
                $leads[] = ['index' => $index] + $payload;
            }

            $requests[$chunkIndex] = [
                'messages' => [
                    ['role' => 'system', 'content' => $this->scoreSystemPrompt(true)],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'user_query' => $brief->query,
                            'is_factual_query' => $isFactualQuery,
                            'icp' => $this->icpPromptContext($brief),
                            'leads' => $leads,
                        ], JSON_UNESCAPED_UNICODE),
                    ],
                ],
                'options' => ['timeout' => 45, 'max_tokens' => 2600],
            ];
        }

        $responses = $this->glm->chatJsonPool($requests, 'score', $organization);

        foreach ($chunks as $chunkIndex => $chunk) {
            $rows = $this->indexScoreRows($responses[$chunkIndex] ?? null, array_keys($chunk));

            foreach ($chunk as $index => $payload) {
                $row = $rows[$index] ?? null;
                if ($row === null) {
                    // Keep the heuristic score rather than inventing one.
                    continue;
                }

                $scores[$index] = $this->applyGlmScoreRow($row, $payload, $brief);
            }
        }

        return $scores;
    }

    /**
     * Only the band around minMatchScore changes an outcome. Clear passes and clear
     * failures keep their heuristic score and cost nothing.
     *
     * @param  array<string, mixed>  $heuristic
     */
    private function needsModelScore(array $heuristic, IcpBrief $brief): bool
    {
        $fit = (float) ($heuristic['icp_fit_score'] ?? 0);
        if ($fit <= 0) {
            // Hard-floored by the truth gates; the model cannot promote it.
            return false;
        }

        $min = (float) max(1, $brief->minMatchScore);

        // Only leads near a decision boundary go to the model: the ICP minimum (recommended or
        // not) and the quality bar (strong or partial). Clear cases keep their heuristic score.
        $nearMinimum = $fit >= $min - 15 && $fit <= $min + 10;
        $nearQualityBar = $fit >= self::QUALITY_BAR - 15 && $fit < self::QUALITY_BAR + 5;

        return $nearMinimum || $nearQualityBar;
    }

    /**
     * @param  array<string, mixed>  $result
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string}
     */
    private function applyGlmScoreRow(array $result, array $companyPayload, IcpBrief $brief): array
    {
        $heuristicRelevance = $this->queryRelevanceFor($companyPayload, $brief);
        $modelRelevance = is_numeric($result['query_relevance_score'] ?? null)
            ? max(0.0, min(100.0, (float) $result['query_relevance_score']))
            : null;
        // The model reads meaning, not token overlap; trust it but keep the authoritative-source lift.
        $queryScore = $modelRelevance === null
            ? $heuristicRelevance
            : (! empty($companyPayload['authoritative_source']) ? min(95, $modelRelevance + 15) : $modelRelevance);

        $modelStatuses = array_filter([
            'industry' => $result['industry'] ?? null,
            'territory' => $result['territory'] ?? null,
            'role' => $result['role'] ?? null,
        ], static fn ($value): bool => is_string($value));

        $evaluation = $this->evaluateEvidence($companyPayload, $brief, $queryScore, $modelStatuses);

        return $this->scoreRowFromEvaluation(
            $evaluation,
            $companyPayload,
            $brief,
            $queryScore,
            trim((string) ($result['rationale'] ?? '')) ?: 'Evidence score (model-checked).',
            (string) ($result['icp_relevance_reason'] ?? ''),
        );
    }

    private function scoreSystemPrompt(bool $batch = false): string
    {
        $row = '"industry":"verified|partial|unknown|contradicted","territory":"verified|partial|unknown|contradicted","role":"verified|partial|unknown|contradicted","query_relevance_score":0-100,"rationale":"","icp_relevance_reason":""';
        $shape = $batch
            ? 'Judge EVERY lead in leads[]. Return JSON: {"results":[{"index":<the lead index>,'.$row.'}]}. One result per lead, echoing its index. Judge each lead only on its own fields — never carry a location or industry from one lead to another.'
            : 'Judge the lead. Return JSON: {'.$row.'}.';

        return $shape.' '.IcpMeaning::RULE.' The lead is a candidate for what the account is looking for; for each target dimension say what the lead\'s own fields prove: "verified" = the fields clearly show it matches the ICP value; "partial" = related or implied (e.g. a payments company for a FinTech ICP, a city inside an ICP country); "unknown" = the fields say nothing about it; "contradicted" = the fields show a different value. role compares a person\'s title with icp.decisionMakers (seniority equivalents count as partial). Never guess a location that is not written in the fields. query_relevance_score is how directly the lead answers user_query (or the ICP brief when user_query is generic): 90+ = exactly what was asked, 60-80 = adjacent, under 40 = unrelated. icp_relevance_reason is one short sentence citing the specific evidence. When is_factual_query is true and the lead is outside the ICP, phrase it like: "Answers your search for X; doesn\'t match your {industries} focus in {territories}."';
    }

    /**
     * @return array<string, mixed>
     */
    private function icpPromptContext(IcpBrief $brief): array
    {
        return IcpMeaning::payload(
            name: $brief->name,
            customPrompt: $brief->customPrompt,
            description: $brief->description,
            industries: $brief->industries,
            territories: $brief->territories,
            companySizes: $brief->companySizes,
            revenueRanges: $brief->revenueRanges,
            decisionMakers: $brief->decisionMakers,
            exclusions: $brief->exclusions,
            minMatchScore: $brief->minMatchScore,
        );
    }

    /**
     * @param  array<string, mixed>|null  $response
     * @param  list<int>  $keys
     * @return array<int, array<string, mixed>>
     */
    private function indexScoreRows(?array $response, array $keys): array
    {
        if ($response === null) {
            return [];
        }

        $rows = $response['results'] ?? $response['leads'] ?? $response['scores'] ?? [];
        if (! is_array($rows)) {
            return [];
        }

        $mapped = [];
        $position = 0;

        foreach ($rows as $row) {
            if (! is_array($row)) {
                $position++;

                continue;
            }

            $index = null;
            if (isset($row['index']) && is_numeric($row['index']) && in_array((int) $row['index'], $keys, true)) {
                $index = (int) $row['index'];
            } elseif (isset($keys[$position])) {
                $index = $keys[$position];
            }

            if ($index !== null && ! isset($mapped[$index])) {
                unset($row['index']);
                $mapped[$index] = $row;
            }

            $position++;
        }

        return $mapped;
    }

    /**
     * Deterministic plain-language ICP reason for heuristic / empty-GLM paths.
     *
     * @param  array<string, mixed>  $companyPayload
     */
    public function buildIcpRelevanceReason(
        IcpBrief $brief,
        float $icpFit,
        bool $isFactualQuery = false,
        array $companyPayload = [],
    ): string {
        $industries = array_slice(array_values(array_filter($brief->industries)), 0, 2);
        $territories = array_slice(array_values(array_filter($brief->territories)), 0, 2);
        $buyers = array_slice(array_values(array_filter($brief->decisionMakers)), 0, 2);

        $industryLabel = $industries !== [] ? implode(' / ', $industries) : 'your target industries';
        $territoryLabel = $territories !== [] ? implode(' / ', $territories) : 'your target territories';
        $buyerLabel = $buyers !== [] ? implode(' / ', $buyers) : null;

        $fit = $this->assessFirmographicFit($companyPayload, $brief);
        $matchesIcp = $fit['verified_match'] && $icpFit >= $brief->minMatchScore;
        // Only name a territory the lead actually evidenced. Claiming "in Lagos / London"
        // for a row with no country is the bug this guard exists to prevent.
        $canClaimTerritory = $territories !== [] && ($fit['territory_verified'] ?? false);
        $leadName = trim((string) ($companyPayload['name'] ?? $companyPayload['person_name'] ?? ''));
        $queryHint = trim($brief->query);
        if ($queryHint === '') {
            $queryHint = 'your search';
        }

        if ($isFactualQuery && ! $matchesIcp) {
            $who = $leadName !== '' ? $leadName : 'This result';

            return "{$who} answers your search for {$queryHint}; isn't what you're looking for ({$industryLabel} in {$territoryLabel}).";
        }

        if ($fit['unknown']) {
            $briefNouns = $this->briefNounOverlap($brief, $companyPayload);
            if ($briefNouns !== []) {
                return 'Matches your search for '.implode(' / ', $briefNouns).'; firmographic fit not verified yet.';
            }

            return 'Matched search; firmographic fit not verified yet.';
        }

        if ($matchesIcp) {
            $hasNicheBrief = trim($brief->customPrompt) !== '' || trim($brief->description) !== '';
            $briefNouns = $hasNicheBrief ? $this->briefNounOverlap($brief, $companyPayload) : [];
            if ($briefNouns !== []) {
                $parts = ['Matches your search for '.implode(' / ', array_map(
                    static fn (string $n): string => mb_convert_case($n, MB_CASE_TITLE, 'UTF-8'),
                    $briefNouns,
                ))];
                if ($canClaimTerritory) {
                    $parts[] = "in {$territoryLabel}";
                }

                return implode(' ', $parts).'.';
            }

            $parts = ["Matches what you're looking for: {$industryLabel}"];
            if ($canClaimTerritory) {
                $parts[] = "in {$territoryLabel}";
            }
            if ($buyerLabel !== null) {
                $parts[] = "reaching {$buyerLabel}";
            }

            return implode(' ', $parts).'.';
        }

        $hasNicheBrief = trim($brief->customPrompt) !== '' || trim($brief->description) !== '';
        $briefNouns = $hasNicheBrief ? $this->briefNounOverlap($brief, $companyPayload) : [];
        if ($briefNouns !== []) {
            $suffix = $canClaimTerritory
                ? '; limited overlap with the rest of what you are looking for.'
                : '; location not confirmed against your territories.';

            return 'Matches your search for '.implode(' / ', array_map(
                static fn (string $n): string => mb_convert_case($n, MB_CASE_TITLE, 'UTF-8'),
                $briefNouns,
            )).$suffix;
        }

        if ($territories !== [] && ! $canClaimTerritory) {
            return "Location not confirmed against {$territoryLabel}, so ICP fit is unproven. Still answers the search request.";
        }

        return "Limited overlap with what you're looking for ({$industryLabel} in {$territoryLabel}). Still answers the search request.";
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function isPersonPayload(array $payload): bool
    {
        return ($payload['entity_type'] ?? null) === 'person'
            || filled($payload['person_name'] ?? null);
    }

    /**
     * Any confirmed tie to the ICP: a matching industry, or a matching territory.
     *
     * @param  array{unknown: bool, verified_match: bool, bonus: float, territory_verified: bool}  $fit
     */
    private function hasIcpEvidence(array $fit): bool
    {
        return $fit['verified_match'] || $fit['bonus'] > 0 || ($fit['territory_verified'] ?? false);
    }

    /**
     * A generated reason may not place a lead in an ICP territory the lead never evidenced.
     *
     * @param  array{unknown: bool, verified_match: bool, bonus: float, territory_verified: bool}  $fit
     */
    private function reasonClaimsUnverifiedTerritory(string $reason, IcpBrief $brief, array $fit): bool
    {
        if ($brief->territories === [] || ($fit['territory_verified'] ?? false)) {
            return false;
        }

        $haystack = mb_strtolower($reason);
        foreach ($brief->territories as $territory) {
            if (! is_string($territory)) {
                continue;
            }
            $needle = mb_strtolower(trim($territory));
            if ($needle !== '' && str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Concrete nouns from the ICP search brief that also appear in the lead payload.
     *
     * @param  array<string, mixed>  $companyPayload
     * @return list<string>
     */
    private function briefNounOverlap(IcpBrief $brief, array $companyPayload): array
    {
        $seed = mb_strtolower($brief->searchBrief());
        if ($seed === '') {
            return [];
        }

        $haystack = mb_strtolower(trim(implode(' ', array_filter([
            (string) ($companyPayload['name'] ?? ''),
            (string) ($companyPayload['person_name'] ?? ''),
            (string) ($companyPayload['company'] ?? ''),
            (string) ($companyPayload['summary'] ?? ''),
            (string) ($companyPayload['title'] ?? ''),
            (string) ($companyPayload['industry'] ?? ''),
            (string) ($companyPayload['sector'] ?? ''),
            (string) ($companyPayload['snippet'] ?? ''),
        ]))));
        if ($haystack === '') {
            return [];
        }

        $stop = [
            'and',
            'the',
            'for',
            'with',
            'from',
            'into',
            'that',
            'this',
            'your',
            'our',
            'companies',
            'company',
            'business',
            'businesses',
            'decision',
            'makers',
            'maker',
            'expanding',
            'emerging',
            'markets',
            'market',
            'focus',
            'looking',
        ];
        $tokens = preg_split('/[^\p{L}\p{N}\-&]+/u', $seed) ?: [];
        $hits = [];
        foreach ($tokens as $token) {
            $token = trim($token);
            if (mb_strlen($token) < 4 || in_array($token, $stop, true)) {
                continue;
            }
            if (str_contains($haystack, $token)) {
                $hits[$token] = $token;
            }
            if (count($hits) >= 3) {
                break;
            }
        }

        return array_values($hits);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{unknown: bool, verified_match: bool, bonus: float, territory_verified: bool}
     */
    public function assessFirmographicFit(array $payload, IcpBrief $brief): array
    {
        $industry = trim((string) (
            $payload['industry'] ?? $payload['sector'] ?? $payload['company_industry'] ?? ''
        ));
        $territory = trim((string) (
            $payload['location'] ?? $payload['territory'] ?? $payload['city'] ?? ''
        ));

        $needsIndustry = $brief->industries !== [];
        $needsTerritory = $brief->territories !== [];

        if (! $needsIndustry && ! $needsTerritory) {
            return ['unknown' => false, 'verified_match' => true, 'bonus' => 0.0, 'territory_verified' => false];
        }

        $hasAnySignal = ($needsIndustry && $industry !== '') || ($needsTerritory && $territory !== '');
        if (! $hasAnySignal) {
            return ['unknown' => true, 'verified_match' => false, 'bonus' => 0.0, 'territory_verified' => false];
        }

        $bonus = 0.0;
        $matchedAny = false;
        $failedConstrained = false;
        $missingTerritory = false;
        $territoryVerified = false;

        if ($needsIndustry) {
            if ($industry === '') {
                // Industry labels are frequently absent, and a confirmed location still
                // carries the constraint that matters most. Not a blocker on its own.
            } elseif ($this->valueMatchesAllowed($brief->industries, $industry)) {
                $bonus += 12;
                $matchedAny = true;
            } else {
                $failedConstrained = true;
            }
        }

        if ($needsTerritory) {
            if ($territory === '') {
                // Territory constrained but unknown: an industry label alone may not
                // stand in for a country the lead never evidenced.
                $missingTerritory = true;
            } elseif ($this->valueMatchesAllowed($brief->territories, $territory)) {
                $bonus += 8;
                $matchedAny = true;
                $territoryVerified = true;
            } else {
                $failedConstrained = true;
            }
        }

        if ($failedConstrained && ! $matchedAny) {
            return ['unknown' => false, 'verified_match' => false, 'bonus' => 0.0, 'territory_verified' => false];
        }

        // Nothing contradicted the ICP and the location (when constrained) was confirmed.
        if ($matchedAny && ! $failedConstrained && ! $missingTerritory) {
            return ['unknown' => false, 'verified_match' => true, 'bonus' => $bonus, 'territory_verified' => $territoryVerified];
        }

        if ($matchedAny) {
            // Partial evidence (e.g. industry matched, country unknown). Credit half the
            // bonus but never claim ICP fit — an industry label alone is not a match.
            return [
                'unknown' => false,
                'verified_match' => false,
                'bonus' => $bonus * 0.5,
                'territory_verified' => $territoryVerified,
            ];
        }

        return ['unknown' => true, 'verified_match' => false, 'bonus' => 0.0, 'territory_verified' => false];
    }

    /**
     * @param  list<string>  $allowed
     */
    private function valueMatchesAllowed(array $allowed, string $candidateValue): bool
    {
        $value = mb_strtolower(trim($candidateValue));
        if ($value === '') {
            return false;
        }

        foreach ($allowed as $option) {
            if (! is_string($option)) {
                continue;
            }
            $option = mb_strtolower(trim($option));
            if ($option === '') {
                continue;
            }
            if ($option === $value || str_contains($value, $option) || str_contains($option, $value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function heuristicQueryRelevance(array $payload, string $query): float
    {
        $normalizedQuery = mb_strtolower(trim($query));
        if ($normalizedQuery === '') {
            return 50.0;
        }

        $haystack = $this->payloadText($payload).' '.mb_strtolower((string) ($payload['location'] ?? ''));

        $stopWords = ['the', 'and', 'for', 'with', 'that', 'who', 'are', 'from', 'into', 'their', 'find', 'give', 'show', 'list', 'get', 'need', 'want', 'leads', 'lead', 'prospects', 'prospect', 'people', 'companies', 'company', 'businesses', 'only', 'some', 'any', 'more'];
        $tokens = preg_split('/\s+/u', preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $normalizedQuery) ?? '') ?: [];
        $tokens = array_values(array_filter($tokens, fn (string $t) => mb_strlen($t) >= 3 && ! in_array($t, $stopWords, true)));
        // Light stemming: "startups" matches "startup", "exporters" matches "exporting".
        $tokens = array_map(static fn (string $t): string => mb_strlen($t) > 5 ? mb_substr($t, 0, mb_strlen($t) - 2) : $t, $tokens);

        if ($tokens === []) {
            return 55.0;
        }

        $matches = 0;
        foreach ($tokens as $token) {
            if (str_contains($haystack, $token)) {
                $matches++;
            }
        }

        return min(95, 45 + (($matches / count($tokens)) * 50));
    }
}
