<?php

namespace App\Services\Scoring;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Llm\GlmClient;

class ScoringService
{
    public function __construct(private readonly GlmClient $glm) {}

    /**
     * Fast heuristic score for first-batch discovery (no GLM round-trip).
     *
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string, icp_relevance_reason: string}
     */
    public function heuristicScore(array $companyPayload, IcpBrief $brief): array
    {
        $hasUserQuery = $brief->hasUserQuery();
        $isFactualQuery = $brief->isAuthoritativePeopleQuery();
        // ICP-brief runs have no user query. Score against the brief itself, otherwise
        // any company in the right industry scores the same as one that sells what we search for.
        $queryScore = $hasUserQuery
            ? $this->heuristicQueryRelevance($companyPayload, $brief->query)
            : $this->heuristicQueryRelevance($companyPayload, $brief->searchBrief());

        $fit = $this->assessFirmographicFit($companyPayload, $brief);
        $icpBase = 55.0;
        if ($fit['verified_match']) {
            $icpBase += $fit['bonus'];
        }
        if (filled($companyPayload['linkedin_url'] ?? null) || filled($companyPayload['title'] ?? null)) {
            $icpBase += 4;
        }
        // Without firmographic evidence, stay below typical minMatchScore so we do not rubber-stamp.
        $icpFit = $fit['unknown']
            ? min(58, $icpBase)
            : min(92, $icpBase);

        if (
            ! $hasUserQuery
            && ! $this->isPersonPayload($companyPayload)
            && ! $this->hasIcpEvidence($fit)
            && $this->briefNounOverlap($brief, $companyPayload) === []
        ) {
            // A company row in ICP-brief mode with nothing tying it to the ICP — no matching
            // industry, no confirmed territory, no brief wording — may not be recommended.
            // People are exempt: their qualification is a trusted profile, not firmographics.
            $icpFit = min($icpFit, max(0, $brief->minMatchScore - 1));
        }

        $priority = $hasUserQuery
            ? min(95, ($queryScore * 0.55) + ($icpFit * 0.45))
            // Brief relevance lifts ranking but never demotes a verified firmographic fit.
            : min(92, max($icpFit, ($queryScore * 0.4) + ($icpFit * 0.6)));

        return [
            'icp_fit_score' => $icpFit,
            'intent_score' => 45.0,
            'priority_score' => $priority,
            'query_relevance_score' => $queryScore,
            'rationale' => 'Heuristic first-batch score.',
            'icp_relevance_reason' => $this->buildIcpRelevanceReason(
                $brief,
                $icpFit,
                $isFactualQuery,
                $companyPayload,
            ),
        ];
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
                [
                    'role' => 'system',
                    'content' => 'Score lead relevance. Return JSON: icp_fit_score (0-100), intent_score (0-100), query_relevance_score (0-100), priority_score (0-100), rationale (string), icp_relevance_reason (string — one short sentence citing specific ICP industries/territories/decision makers). Score query relevance to the user\'s words first. ICP fit is advisory — results that answer the query but fall outside ICP industries/territories should still have high query_relevance_score. If ICP territories are set and the lead\'s location is a different country, icp_fit_score must be low unless the user query named that other country. Boost query_relevance_score when authoritative_source is true. When is_factual_query is true and icp_fit_score is below minMatchScore, phrase icp_relevance_reason like: "Answers your search for X; doesn\'t match your {industries} focus in {territories}." When firmographic fields are missing, do not claim the lead fits ICP industries.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'is_factual_query' => $isFactualQuery,
                        'icp' => [
                            'name' => $brief->name,
                            'description' => $brief->description,
                            'industries' => $brief->industries,
                            'territories' => $brief->territories,
                            'companySizes' => $brief->companySizes,
                            'decisionMakers' => $brief->decisionMakers,
                            'customPrompt' => $brief->customPrompt,
                            'minMatchScore' => $brief->minMatchScore,
                        ],
                        'company' => $companyPayload,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'score', $organization);

            $queryRelevance = (float) ($result['query_relevance_score'] ?? 50);
            $icpFit = (float) ($result['icp_fit_score'] ?? 50);
            $priority = (float) ($result['priority_score'] ?? 45);

            if ($hasUserQuery) {
                $priority = min(95, ($queryRelevance * 0.65) + ($icpFit * 0.35));
            }

            if (! empty($companyPayload['authoritative_source'])) {
                $queryRelevance = min(95, $queryRelevance + 15);
                if ($hasUserQuery) {
                    $priority = min(95, ($queryRelevance * 0.65) + ($icpFit * 0.35));
                }
            }

            $fit = $this->assessFirmographicFit($companyPayload, $brief);
            if (
                ! $hasUserQuery
                && ! $this->isPersonPayload($companyPayload)
                && ! $this->hasIcpEvidence($fit)
                && $this->briefNounOverlap($brief, $companyPayload) === []
            ) {
                // Same truth floor as the heuristic path: the model may not promote a lead
                // whose only evidence is an industry label.
                $icpFit = min($icpFit, max(0, $brief->minMatchScore - 1));
                $priority = min($priority, $icpFit);
            }

            $reason = trim((string) ($result['icp_relevance_reason'] ?? ''));
            if ($reason === '' || $this->reasonClaimsUnverifiedTerritory($reason, $brief, $fit)) {
                $reason = $this->buildIcpRelevanceReason($brief, $icpFit, $isFactualQuery, $companyPayload);
            }

            return [
                'icp_fit_score' => $icpFit,
                'intent_score' => (float) ($result['intent_score'] ?? 40),
                'priority_score' => $priority,
                'query_relevance_score' => $queryRelevance,
                'rationale' => (string) ($result['rationale'] ?? ''),
                'icp_relevance_reason' => $reason,
            ];
        } catch (\Throwable) {
            $queryScore = $hasUserQuery
                ? $this->heuristicQueryRelevance($companyPayload, $brief->query)
                : 45.0;
            $icpFit = 50.0;

            return [
                'icp_fit_score' => $icpFit,
                'intent_score' => 40.0,
                'priority_score' => $hasUserQuery ? max(45, $queryScore - 5) : 45.0,
                'query_relevance_score' => $queryScore,
                'rationale' => 'Scoring fallback.',
                'icp_relevance_reason' => $this->buildIcpRelevanceReason(
                    $brief,
                    $icpFit,
                    $isFactualQuery,
                    $companyPayload,
                ),
            ];
        }
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

            return "{$who} answers your search for {$queryHint}; doesn't match your {$industryLabel} focus in {$territoryLabel}.";
        }

        if ($fit['unknown']) {
            $briefNouns = $this->briefNounOverlap($brief, $companyPayload);
            if ($briefNouns !== []) {
                return 'Matches your search for ' . implode(' / ', $briefNouns) . '; firmographic fit not verified yet.';
            }

            return 'Matched search; firmographic fit not verified yet.';
        }

        if ($matchesIcp) {
            $hasNicheBrief = trim($brief->customPrompt) !== '' || trim($brief->description) !== '';
            $briefNouns = $hasNicheBrief ? $this->briefNounOverlap($brief, $companyPayload) : [];
            if ($briefNouns !== []) {
                $parts = ['Matches your search for ' . implode(' / ', array_map(
                    static fn(string $n): string => mb_convert_case($n, MB_CASE_TITLE, 'UTF-8'),
                    $briefNouns,
                ))];
                if ($canClaimTerritory) {
                    $parts[] = "in {$territoryLabel}";
                }

                return implode(' ', $parts) . '.';
            }

            $parts = ["Fits your {$industryLabel} focus"];
            if ($canClaimTerritory) {
                $parts[] = "in {$territoryLabel}";
            }
            if ($buyerLabel !== null) {
                $parts[] = "aligned with {$buyerLabel}";
            }

            return implode(' ', $parts) . '.';
        }

        $hasNicheBrief = trim($brief->customPrompt) !== '' || trim($brief->description) !== '';
        $briefNouns = $hasNicheBrief ? $this->briefNounOverlap($brief, $companyPayload) : [];
        if ($briefNouns !== []) {
            $suffix = $canClaimTerritory
                ? '; limited firmographic overlap with your ICP filters.'
                : '; location not confirmed against your territories.';

            return 'Matches your search for ' . implode(' / ', array_map(
                static fn(string $n): string => mb_convert_case($n, MB_CASE_TITLE, 'UTF-8'),
                $briefNouns,
            )) . $suffix;
        }

        if ($territories !== [] && ! $canClaimTerritory) {
            return "Location not confirmed against {$territoryLabel}, so ICP fit is unproven. Still answers the search request.";
        }

        return "Limited overlap with your {$industryLabel} focus in {$territoryLabel}. Still answers the search request.";
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

        $haystack = mb_strtolower(implode(' ', array_filter([
            (string) ($payload['name'] ?? ''),
            (string) ($payload['summary'] ?? ''),
            (string) ($payload['sector'] ?? ''),
            (string) ($payload['title'] ?? ''),
            (string) ($payload['company'] ?? ''),
        ])));

        $tokens = preg_split('/\s+/u', preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $normalizedQuery) ?? '') ?: [];
        $tokens = array_values(array_filter($tokens, fn(string $t) => mb_strlen($t) >= 3));

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
