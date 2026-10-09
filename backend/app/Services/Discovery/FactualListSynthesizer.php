<?php

namespace App\Services\Discovery;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Llm\GlmClient;

class FactualListSynthesizer
{
    public function __construct(
        private readonly GlmClient $glm,
        private readonly PersonNameValidator $personNameValidator,
    ) {}

    /**
     * @param  list<array{hit: RawDiscoveryHit, extracted: array<string, mixed>}>  $candidates
     * @return list<array{hit: RawDiscoveryHit, extracted: array<string, mixed>}>
     */
    public function synthesize(
        Organization $organization,
        IcpBrief $brief,
        array $candidates,
        int $limit,
    ): array {
        if (count($candidates) >= $limit || ! $this->glm->isConfigured()) {
            return $candidates;
        }

        $snippets = [];
        foreach ($candidates as $candidate) {
            $hit = $candidate['hit'];
            $snippets[] = [
                'title' => $hit->name,
                'snippet' => $hit->snippet,
                'url' => $hit->url,
            ];
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract individual real people names that answer the user query. Return JSON: people (array of {person_name, title optional, company optional, summary optional}). Use ONLY names supported by the snippets — never invent. Max '.$limit.' people. Full first and last names only.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'existing_count' => count($candidates),
                        'needed' => $limit,
                        'snippets' => $snippets,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            $people = $result['people'] ?? [];
            if (! is_array($people)) {
                return $candidates;
            }

            $fallbackHit = $candidates[0]['hit'] ?? null;
            if (! $fallbackHit instanceof RawDiscoveryHit) {
                return $candidates;
            }

            $existingNames = [];
            foreach ($candidates as $candidate) {
                $existingNames[mb_strtolower((string) ($candidate['extracted']['person_name'] ?? $candidate['extracted']['name'] ?? ''))] = true;
            }

            foreach ($people as $person) {
                if (! is_array($person)) {
                    continue;
                }

                $personName = trim((string) ($person['person_name'] ?? $person['name'] ?? ''));
                $nameKey = mb_strtolower($personName);
                if ($personName === '' || isset($existingNames[$nameKey])) {
                    continue;
                }

                $extracted = [
                    'person_name' => $personName,
                    'name' => $personName,
                    'title' => trim((string) ($person['title'] ?? '')),
                    'company' => trim((string) ($person['company'] ?? '')),
                    'summary' => (string) ($person['summary'] ?? $fallbackHit->snippet ?? ''),
                    'business_fields' => ['source_url' => $fallbackHit->url],
                    'commercial_signals' => [],
                    'low_confidence' => false,
                    'from_listicle' => true,
                    'synthesized' => true,
                ];

                if (! $this->personNameValidator->isValidPersonName($personName, $extracted)) {
                    continue;
                }

                $candidates[] = ['hit' => $fallbackHit, 'extracted' => $extracted];
                $existingNames[$nameKey] = true;

                if (count($candidates) >= $limit) {
                    break;
                }
            }
        } catch (\Throwable) {
            // Keep partial candidates.
        }

        return $candidates;
    }
}
