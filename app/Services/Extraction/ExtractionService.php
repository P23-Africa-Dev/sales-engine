<?php

namespace App\Services\Extraction;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\QueryIntentService;
use App\Services\Llm\GlmClient;

class ExtractionService
{
    public function __construct(
        private readonly GlmClient $glm,
        private readonly QueryIntentService $queryIntent,
    ) {}

    /**
     * @return list<array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, person_name?: string, title?: string, company?: string, linkedin_url?: string, low_confidence?: bool, from_listicle?: bool}>
     */
    public function extractMany(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        if ($brief->isListiclePeopleQuery()) {
            $listiclePeople = $this->extractListiclePeople($hit, $brief, $organization);
            if ($listiclePeople !== []) {
                return $listiclePeople;
            }
        }

        $single = $this->extract($hit, $brief, $organization);
        $name = trim((string) ($single['person_name'] ?? $single['name'] ?? ''));

        if ($name === '') {
            return [];
        }

        return [$single];
    }

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, person_name?: string, title?: string, company?: string, linkedin_url?: string, low_confidence?: bool, from_listicle?: bool}
     */
    public function extract(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        if ($brief->isPeopleSearch()) {
            return $this->extractPerson($hit, $brief, $organization);
        }

        if (! $this->glm->isConfigured()) {
            return $this->fallbackCompany($hit);
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract structured company intelligence as JSON with keys: name, sector, location, summary, business_fields (object), commercial_signals (array of strings). Never use the ICP profile name as the company name unless the hit explicitly refers to that exact company. No markdown.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'icp' => [
                            'industries' => $brief->industries,
                            'territories' => $brief->territories,
                        ],
                        'hit' => [
                            'name' => $hit->name,
                            'snippet' => $hit->snippet,
                            'url' => $hit->url,
                            'website' => $hit->website,
                            'location' => $hit->location,
                            'sector' => $hit->sector,
                            'source' => $hit->source,
                            'provider' => $hit->provider,
                        ],
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            if (($result['name'] ?? '') === $brief->name) {
                $result['name'] = $hit->name;
            }

            return $result;
        } catch (\Throwable) {
            return $this->fallbackCompany($hit);
        }
    }

    /**
     * @return list<array{name?: string, person_name?: string, title?: string, company?: string, linkedin_url?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool, from_listicle?: bool}>
     */
    private function extractListiclePeople(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        $limit = $brief->requestedLimit;

        if ($this->glm->isConfigured()) {
            try {
                $result = $this->glm->chatJson([
                    [
                        'role' => 'system',
                        'content' => 'Extract individual person names from a listicle search result. Return JSON: people (array of objects with person_name, title optional, company optional, summary optional). Use real names only — never invent. Max ' . $limit . ' people. No markdown.',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'user_query' => $brief->query,
                            'title' => $hit->name,
                            'snippet' => $hit->snippet,
                            'url' => $hit->url,
                            'limit' => $limit,
                        ], JSON_UNESCAPED_UNICODE),
                    ],
                ], 'extract', $organization);

                $people = $result['people'] ?? [];
                if (! is_array($people)) {
                    $people = [];
                }

                $extracted = [];
                foreach ($people as $person) {
                    if (! is_array($person)) {
                        continue;
                    }

                    $personName = trim((string) ($person['person_name'] ?? $person['name'] ?? ''));
                    if ($personName === '' || mb_strtolower($personName) === mb_strtolower($brief->name)) {
                        continue;
                    }

                    if ($this->queryIntent->looksLikeArticleTitle($personName)) {
                        continue;
                    }

                    $extracted[] = [
                        'person_name' => $personName,
                        'name' => $personName,
                        'title' => trim((string) ($person['title'] ?? '')),
                        'company' => trim((string) ($person['company'] ?? '')),
                        'linkedin_url' => $hit->url,
                        'location' => $person['location'] ?? $hit->location,
                        'summary' => (string) ($person['summary'] ?? $hit->snippet ?? $hit->name),
                        'business_fields' => ['source_url' => $hit->url],
                        'commercial_signals' => [],
                        'low_confidence' => false,
                        'from_listicle' => true,
                    ];

                    if (count($extracted) >= $limit) {
                        break;
                    }
                }

                if ($extracted !== []) {
                    return $extracted;
                }
            } catch (\Throwable) {
                // Fall through to heuristic parsing.
            }
        }

        return $this->heuristicListiclePeople($hit, $brief, $limit);
    }

    /**
     * @return list<array{name?: string, person_name?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool, from_listicle?: bool}>
     */
    private function heuristicListiclePeople(RawDiscoveryHit $hit, IcpBrief $brief, int $limit): array
    {
        $text = trim(($hit->snippet ?? '') . "\n" . ($hit->name ?? ''));
        $extracted = [];

        if (preg_match_all('/(?:\d+[\.\)]\s*|[\-\x{2022}]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/u', $text, $matches)) {
            foreach ($matches[1] as $name) {
                $personName = trim($name);
                if ($personName === '' || mb_strtolower($personName) === mb_strtolower($brief->name)) {
                    continue;
                }

                if ($this->queryIntent->looksLikeArticleTitle($personName)) {
                    continue;
                }

                $extracted[] = [
                    'person_name' => $personName,
                    'name' => $personName,
                    'summary' => $hit->snippet ?? $hit->name,
                    'business_fields' => ['source_url' => $hit->url],
                    'commercial_signals' => [],
                    'low_confidence' => true,
                    'from_listicle' => true,
                ];

                if (count($extracted) >= $limit) {
                    break;
                }
            }
        }

        return $extracted;
    }

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, person_name?: string, title?: string, company?: string, linkedin_url?: string, low_confidence?: bool}
     */
    private function extractPerson(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        if (! $this->glm->isConfigured()) {
            return $this->fallbackPerson($hit, $brief);
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract person lead data as JSON with keys: person_name, title, company, linkedin_url, location, summary. Never use the ICP profile name as person_name. If the hit is an article/listicle with no identifiable person, set person_name to empty string. No markdown.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'user_query' => $brief->query,
                        'hit' => [
                            'name' => $hit->name,
                            'snippet' => $hit->snippet,
                            'url' => $hit->url,
                        ],
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            $personName = trim((string) ($result['person_name'] ?? ''));
            if ($personName === '' || mb_strtolower($personName) === mb_strtolower($brief->name)) {
                return $this->fallbackPerson($hit, $brief);
            }

            $summary = (string) ($result['summary'] ?? $hit->snippet ?? $hit->name);
            $title = trim((string) ($result['title'] ?? ''));
            $company = trim((string) ($result['company'] ?? ''));

            if ($title !== '' && $company !== '') {
                $summary = "{$title} at {$company}. {$summary}";
            }

            return [
                'person_name' => $personName,
                'name' => $personName,
                'title' => $title,
                'company' => $company,
                'linkedin_url' => $result['linkedin_url'] ?? $hit->url,
                'location' => $result['location'] ?? $hit->location,
                'summary' => $summary,
                'business_fields' => array_filter([
                    'linkedin_url' => $result['linkedin_url'] ?? $hit->url,
                    'title' => $title,
                    'company' => $company,
                ]),
                'commercial_signals' => [],
                'low_confidence' => false,
            ];
        } catch (\Throwable) {
            return $this->fallbackPerson($hit, $brief);
        }
    }

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool}
     */
    private function fallbackCompany(RawDiscoveryHit $hit): array
    {
        return [
            'name' => $hit->name,
            'sector' => $hit->sector,
            'location' => $hit->location,
            'summary' => $hit->snippet ?? $hit->name,
            'business_fields' => ['website' => $hit->website],
            'commercial_signals' => [],
            'low_confidence' => true,
        ];
    }

    /**
     * @return array{name?: string, person_name?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool}
     */
    private function fallbackPerson(RawDiscoveryHit $hit, IcpBrief $brief): array
    {
        $name = $hit->name;

        if ($this->queryIntent->looksLikeArticleTitle($name) && ! $brief->isListiclePeopleQuery()) {
            return [
                'name' => '',
                'person_name' => '',
                'summary' => $hit->snippet ?? '',
                'business_fields' => [],
                'commercial_signals' => [],
                'low_confidence' => true,
            ];
        }

        return [
            'name' => $name,
            'person_name' => $name,
            'summary' => $hit->snippet ?? $name,
            'business_fields' => ['linkedin_url' => $hit->url],
            'commercial_signals' => [],
            'low_confidence' => true,
        ];
    }
}
