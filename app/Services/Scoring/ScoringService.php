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
        $queryScore = $hasUserQuery
            ? $this->heuristicQueryRelevance($companyPayload, $brief->query)
            : 55.0;
        $icpBase = 55.0 + (count($brief->industries) > 0 ? 12 : 0) + (count($brief->territories) > 0 ? 8 : 0);
        if (filled($companyPayload['linkedin_url'] ?? null) || filled($companyPayload['title'] ?? null)) {
            $icpBase += 8;
        }
        $icpFit = min(92, $icpBase);
        $priority = $hasUserQuery
            ? min(95, ($queryScore * 0.55) + ($icpFit * 0.45))
            : min(92, $icpFit);

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
                    'content' => 'Score lead relevance. Return JSON: icp_fit_score (0-100), intent_score (0-100), query_relevance_score (0-100), priority_score (0-100), rationale (string), icp_relevance_reason (string — one short sentence citing specific ICP industries/territories/decision makers). Score query relevance to the user\'s words first. ICP fit is advisory — results that answer the query but fall outside ICP industries/territories should still have high query_relevance_score. Boost query_relevance_score when authoritative_source is true. When is_factual_query is true and icp_fit_score is below minMatchScore, phrase icp_relevance_reason like: "Answers your search for X; doesn\'t match your {industries} focus in {territories}."',
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

            $reason = trim((string) ($result['icp_relevance_reason'] ?? ''));
            if ($reason === '') {
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

        $matchesIcp = $icpFit >= $brief->minMatchScore;
        $leadName = trim((string) ($companyPayload['name'] ?? $companyPayload['person_name'] ?? ''));
        $queryHint = trim($brief->query);
        if ($queryHint === '') {
            $queryHint = 'your search';
        }

        if ($isFactualQuery && ! $matchesIcp) {
            $who = $leadName !== '' ? $leadName : 'This result';

            return "{$who} answers your search for {$queryHint}; doesn't match your {$industryLabel} focus in {$territoryLabel}.";
        }

        if ($matchesIcp) {
            $parts = ["Fits your {$industryLabel} focus"];
            if ($territories !== []) {
                $parts[] = "in {$territoryLabel}";
            }
            if ($buyerLabel !== null) {
                $parts[] = "aligned with {$buyerLabel}";
            }

            return implode(' ', $parts).'.';
        }

        return "Limited overlap with your {$industryLabel} focus in {$territoryLabel} — still answers the search request.";
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
        $tokens = array_values(array_filter($tokens, fn (string $t) => mb_strlen($t) >= 3));

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
