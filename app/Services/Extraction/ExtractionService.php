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
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, person_name?: string, title?: string, company?: string, linkedin_url?: string, low_confidence?: bool}
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
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, person_name?: string, title?: string, company?: string, linkedin_url?: string, low_confidence?: bool}
     */
    private function extractPerson(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        if (! $this->glm->isConfigured()) {
            return $this->fallbackPerson($hit);
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
                return $this->fallbackPerson($hit);
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
            return $this->fallbackPerson($hit);
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
    private function fallbackPerson(RawDiscoveryHit $hit): array
    {
        $name = $hit->name;

        if ($this->queryIntent->looksLikeArticleTitle($name)) {
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
