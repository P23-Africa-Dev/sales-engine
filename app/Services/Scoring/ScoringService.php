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
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, rationale: string}
     */
    public function score(array $companyPayload, IcpBrief $brief, Organization $organization): array
    {
        if (! $this->glm->isConfigured()) {
            $base = 55.0 + (count($brief->industries) > 0 ? 10 : 0);

            return [
                'icp_fit_score' => min(95, $base),
                'intent_score' => 40.0,
                'priority_score' => min(95, $base - 5),
                'rationale' => 'Heuristic score (GLM unavailable).',
            ];
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Score ICP fit. Return JSON: icp_fit_score (0-100), intent_score (0-100), priority_score (0-100), rationale (string).',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
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

            return [
                'icp_fit_score' => (float) ($result['icp_fit_score'] ?? 50),
                'intent_score' => (float) ($result['intent_score'] ?? 40),
                'priority_score' => (float) ($result['priority_score'] ?? 45),
                'rationale' => (string) ($result['rationale'] ?? ''),
            ];
        } catch (\Throwable) {
            return [
                'icp_fit_score' => 50.0,
                'intent_score' => 40.0,
                'priority_score' => 45.0,
                'rationale' => 'Scoring fallback.',
            ];
        }
    }
}
