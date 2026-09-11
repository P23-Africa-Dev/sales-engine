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
                    'content' => 'Extract structured company intelligence as JSON with keys: name, sector, location, summary, contact_email (only if explicitly present in the hit; never invent; reject generic info@/contact@), contact_phone (only if explicitly present; never invent), business_fields (object), commercial_signals (array of strings). The name must be a real company/organization name — never an article title, tip list, award, requirement phrase, blog post, or generic advice headline. If the hit is not a real company, set name to an empty string. Never use the ICP profile name as the company name unless the hit explicitly refers to that exact company. No markdown.',
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

            $companyName = trim((string) ($result['name'] ?? ''));
            if ($companyName === '' || $this->queryIntent->looksLikeContentOrGenericPhrase($companyName)) {
                return [
                    'name' => '',
                    'sector' => $result['sector'] ?? $hit->sector,
                    'location' => $result['location'] ?? $hit->location,
                    'summary' => $result['summary'] ?? ($hit->snippet ?? ''),
                    'business_fields' => $result['business_fields'] ?? ['website' => $hit->website],
                    'commercial_signals' => $result['commercial_signals'] ?? [],
                    'low_confidence' => true,
                ];
            }

            $contactEmail = trim((string) ($result['contact_email'] ?? $result['email'] ?? ''));
            $contactPhone = trim((string) ($result['contact_phone'] ?? $result['phone'] ?? ''));
            if ($contactEmail !== '' && filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
                $result['email'] = $contactEmail;
            }
            if ($contactPhone !== '') {
                $digits = preg_replace('/\D+/', '', $contactPhone) ?? '';
                if (strlen($digits) >= 7 && strlen($digits) <= 15) {
                    $result['phone'] = $contactPhone;
                }
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
                        'content' => 'Extract individual person names from a listicle search result. Return JSON: people (array of objects with person_name, title optional, company optional, summary optional — one unique sentence per person from the snippet, never the full listicle). Use real full names only (first and last name) — never invent, never return sentence fragments, channel names, article titles, or single generic words. Include title and company when mentioned near each name. Max ' . $limit . ' people. No markdown.',
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

                    $isListicleUrl = $this->queryIntent->isListicleUrl($hit->url);
                    $personSummary = trim((string) ($person['summary'] ?? ''));
                    if ($personSummary === '' || $this->looksLikeSharedListicleSnippet($personSummary, $hit->snippet)) {
                        $personSummary = '';
                    }

                    $extracted[] = [
                        'person_name' => $personName,
                        'name' => $personName,
                        'title' => trim((string) ($person['title'] ?? '')),
                        'company' => trim((string) ($person['company'] ?? '')),
                        'linkedin_url' => $isListicleUrl ? null : $hit->url,
                        'location' => $person['location'] ?? $hit->location,
                        'summary' => $personSummary,
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

        if (preg_match_all('/(?:\d+[\.\)]\s*|[\-\x{2022}]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/u', $text, $matches)) {
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
                    'summary' => '',
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
        // Fast path: LinkedIn profile URLs and clear snippet names — skip slow GLM.
        $heuristic = $this->fallbackPerson($hit, $brief);
        if (filled($heuristic['person_name'] ?? null) && ! ($heuristic['low_confidence'] ?? true)) {
            return $heuristic;
        }
        if ($this->isLinkedInProfileUrl($hit->url) && filled($heuristic['person_name'] ?? null)) {
            return $heuristic;
        }

        if (! $this->glm->isConfigured()) {
            return $heuristic;
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract person lead data as JSON with keys: person_name, title, company, linkedin_url, location, summary, email (only if explicitly present in the hit; never invent; reject generic info@/contact@), phone (only if explicitly present; never invent). Never use the ICP profile name as person_name. If the hit is an article/listicle with no identifiable person, set person_name to empty string. No markdown.',
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
            ], 'extract', $organization, ['timeout' => 12, 'max_tokens' => 400]);

            $personName = trim((string) ($result['person_name'] ?? ''));
            if ($personName === '' || mb_strtolower($personName) === mb_strtolower($brief->name)) {
                return $heuristic;
            }

            $summary = (string) ($result['summary'] ?? $hit->snippet ?? $hit->name);
            $title = trim((string) ($result['title'] ?? ''));
            $company = trim((string) ($result['company'] ?? ''));
            $email = trim((string) ($result['email'] ?? ''));
            $phone = trim((string) ($result['phone'] ?? ''));
            if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $email = '';
            }
            if ($phone !== '') {
                $digits = preg_replace('/\D+/', '', $phone) ?? '';
                if (strlen($digits) < 7 || strlen($digits) > 15) {
                    $phone = '';
                }
            }

            if ($title !== '' && $company !== '') {
                $summary = "{$title} at {$company}. {$summary}";
            }

            return array_filter([
                'person_name' => $personName,
                'name' => $personName,
                'title' => $title,
                'company' => $company,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'linkedin_url' => $this->resolvePersonUrl($result['linkedin_url'] ?? null, $hit->url),
                'location' => $result['location'] ?? $hit->location,
                'summary' => $summary,
                'business_fields' => array_filter([
                    'linkedin_url' => $this->resolvePersonUrl($result['linkedin_url'] ?? null, $hit->url),
                    'title' => $title,
                    'company' => $company,
                    'email' => $email !== '' ? $email : null,
                    'phone' => $phone !== '' ? $phone : null,
                ]),
                'commercial_signals' => [],
                'low_confidence' => false,
            ], fn($v) => $v !== null && $v !== '');
        } catch (\Throwable) {
            return $heuristic;
        }
    }

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool}
     */
    private function fallbackCompany(RawDiscoveryHit $hit): array
    {
        $name = $hit->name;
        if ($this->queryIntent->looksLikeContentOrGenericPhrase($name)) {
            return [
                'name' => '',
                'sector' => $hit->sector,
                'location' => $hit->location,
                'summary' => $hit->snippet ?? '',
                'business_fields' => ['website' => $hit->website],
                'commercial_signals' => [],
                'low_confidence' => true,
            ];
        }

        return [
            'name' => $name,
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
        $name = '';
        $linkedinUrl = null;
        $lowConfidence = true;

        if ($this->isLinkedInProfileUrl($hit->url)) {
            $fromSlug = $this->personNameFromLinkedInUrl((string) $hit->url);
            if ($fromSlug !== '') {
                $name = $fromSlug;
                $linkedinUrl = $hit->url;
                $lowConfidence = false;
            }
        }

        if ($name === '') {
            $fromSnippet = $this->personNameFromSnippet((string) ($hit->snippet ?? ''), (string) $hit->name);
            if ($fromSnippet !== '') {
                $name = $fromSnippet;
                $lowConfidence = false;
            }
        }

        if ($name === '') {
            $name = $hit->name;
        }

        if (
            ($this->queryIntent->looksLikeArticleTitle($name) || $this->queryIntent->looksLikeContentOrGenericPhrase($name))
            && ! $brief->isListiclePeopleQuery()
            && ! $this->isLinkedInProfileUrl($hit->url)
        ) {
            return [
                'name' => '',
                'person_name' => '',
                'summary' => $hit->snippet ?? '',
                'business_fields' => [],
                'commercial_signals' => [],
                'low_confidence' => true,
            ];
        }

        return array_filter([
            'name' => $name,
            'person_name' => $name,
            'linkedin_url' => $linkedinUrl,
            'summary' => $this->queryIntent->isListicleUrl($hit->url) ? '' : ($hit->snippet ?? $name),
            'business_fields' => array_filter([
                'source_url' => $hit->url,
                'linkedin_url' => $linkedinUrl,
            ]),
            'commercial_signals' => [],
            'low_confidence' => $lowConfidence,
        ], fn($v) => $v !== null && $v !== '');
    }

    private function isLinkedInProfileUrl(?string $url): bool
    {
        if (! filled($url)) {
            return false;
        }

        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) parse_url($url, PHP_URL_PATH);

        return str_contains($host, 'linkedin.com') && (bool) preg_match('#/in/[^/]+#', $path);
    }

    private function personNameFromLinkedInUrl(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH) ?? '';
        if (! preg_match('#/in/([^/?]+)#', $path, $matches)) {
            return '';
        }

        $slug = urldecode($matches[1]);
        // Drop trailing id segments that contain digits (e.g. -80511172, -b1a81334).
        while (preg_match('/^(.*)-([a-z]*\d[a-z0-9]*)$/iu', $slug, $idMatch)) {
            $slug = $idMatch[1];
        }
        $slug = str_replace(['-', '_'], ' ', $slug);
        $candidate = trim(ucwords(mb_strtolower($slug)));

        if ($candidate === '' || $this->queryIntent->looksLikeContentOrGenericPhrase($candidate)) {
            return '';
        }

        return $candidate;
    }

    private function personNameFromSnippet(string $snippet, string $title): string
    {
        $haystack = trim($snippet . ' ' . $title);
        if ($haystack === '') {
            return '';
        }

        if (preg_match('/\b([A-Z][\p{L}\']+(?:\s+[A-Z][\p{L}\']+){1,2})\s+(?:has been appointed|appointed|is the|joins as|named)\b/u', $haystack, $m)) {
            $candidate = trim($m[1]);
            if (! $this->queryIntent->looksLikeContentOrGenericPhrase($candidate)) {
                return $candidate;
            }
        }

        if (preg_match('/^([A-Z][\p{L}\']+(?:\s+[A-Z][\p{L}\']+){1,2})\s*[-–|]/u', $title, $m)) {
            $candidate = trim($m[1]);
            if (! $this->queryIntent->looksLikeContentOrGenericPhrase($candidate)) {
                return $candidate;
            }
        }

        return '';
    }

    private function resolvePersonUrl(?string $candidate, ?string $fallback): ?string
    {
        $url = trim((string) ($candidate ?: $fallback));
        if ($url === '' || $this->queryIntent->isListicleUrl($url)) {
            return null;
        }

        return $url;
    }

    private function looksLikeSharedListicleSnippet(string $summary, ?string $snippet): bool
    {
        if ($snippet === null || trim($snippet) === '') {
            return false;
        }

        if (trim($summary) === trim($snippet)) {
            return true;
        }

        return (bool) preg_match('/\d+[\.\)]\s+[A-Z][a-z]+/u', $summary);
    }
}
