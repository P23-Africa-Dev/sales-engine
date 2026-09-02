<?php

namespace App\Services\Scoring;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Llm\GlmClient;

class ScoringService
{
    public function __construct(private readonly GlmClient $glm) {}

    /**
     * @param  array<string, mixed>  $companyPayload
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}
     */
    public function score(array $companyPayload, IcpBrief $brief, Organization $organization): array
    {
        $hasUserQuery = $brief->hasUserQuery();

        if (! $this->glm->isConfigured()) {
            $queryScore = $hasUserQuery
                ? $this->heuristicQueryRelevance($companyPayload, $brief->query)
                : 50.0;
            $icpBase = 55.0 + (count($brief->industries) > 0 ? 10 : 0);

            $priority = $hasUserQuery
                ? min(95, ($queryScore * 0.7) + ($icpBase * 0.3))
                : min(95, $icpBase - 5);

            return [
                'icp_fit_score' => min(95, $icpBase),
                'intent_score' => 40.0,
                'priority_score' => $priority,
                'query_relevance_score' => $queryScore,
                'rationale' => 'Heuristic score (GLM unavailable).',
            ];
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Score lead relevance. Return JSON: icp_fit_score (0-100), intent_score (0-100), query_relevance_score (0-100), priority_score (0-100), rationale (string). Score query relevance to the user\'s words first. ICP fit is advisory — results that answer the query but fall outside ICP industries/territories should still have high query_relevance_score. Boost query_relevance_score when authoritative_source is true.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'icp' => [
                            'name' => $brief->name,
                            'industries' => $brief->industries,
                            'territories' => $brief->territories,
                            'companySizes' => $brief->companySizes,
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

            return [
                'icp_fit_score' => $icpFit,
                'intent_score' => (float) ($result['intent_score'] ?? 40),
                'priority_score' => $priority,
                'query_relevance_score' => $queryRelevance,
                'rationale' => (string) ($result['rationale'] ?? ''),
            ];
        } catch (\Throwable) {
            $queryScore = $hasUserQuery
                ? $this->heuristicQueryRelevance($companyPayload, $brief->query)
                : 45.0;

            return [
                'icp_fit_score' => 50.0,
                'intent_score' => 40.0,
                'priority_score' => $hasUserQuery ? max(45, $queryScore - 5) : 45.0,
                'query_relevance_score' => $queryScore,
                'rationale' => 'Scoring fallback.',
            ];
        }
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
