<?php

namespace App\Services\Extraction;

use App\Models\Organization;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\QueryIntentService;
use App\Services\Llm\GlmClient;

class ExtractionService
{
    /** Hits per model call. Larger batches save latency but blur attention per row. */
    private const BATCH_SIZE = 10;

    public function __construct(
        private readonly GlmClient $glm,
        private readonly QueryIntentService $queryIntent,
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    /**
     * Extract a whole page of hits with one model call per chunk, chunks running
     * concurrently. One call per hit was what limited a run to ~19 candidates.
     *
     * @param  list<RawDiscoveryHit>  $hits
     * @return array<int, list<array<string, mixed>>>  Keyed by the input index.
     */
    public function extractManyBatch(array $hits, IcpBrief $brief, Organization $organization): array
    {
        if ($hits === []) {
            return [];
        }

        $isPeople = $brief->isPeopleSearch();
        $extracted = [];
        $pending = [];

        foreach ($hits as $index => $hit) {
            // Listicles expand one hit into many people; keep that on the single-hit path.
            if ($brief->isListiclePeopleQuery()) {
                $extracted[$index] = $this->extractMany($hit, $brief, $organization);

                continue;
            }

            if ($isPeople) {
                $heuristic = $this->fallbackPerson($hit, $brief);
                $hasName = filled($heuristic['person_name'] ?? null);
                if (($hasName && ! ($heuristic['low_confidence'] ?? true))
                    || ($hasName && $this->isLinkedInProfileUrl($hit->url))
                ) {
                    $extracted[$index] = $this->wrapExtractedRow($heuristic);

                    continue;
                }
            }

            $pending[$index] = $hit;
        }

        if ($pending === []) {
            ksort($extracted);

            return $extracted;
        }

        if (! $this->glm->isConfigured()) {
            foreach ($pending as $index => $hit) {
                $extracted[$index] = $this->wrapExtractedRow($this->fallbackRow($hit, $brief, $isPeople));
            }
            ksort($extracted);

            return $extracted;
        }

        $chunks = array_chunk($pending, self::BATCH_SIZE, true);
        $requests = [];
        foreach ($chunks as $chunkIndex => $chunk) {
            $requests[$chunkIndex] = [
                'messages' => $isPeople
                    ? $this->personBatchMessages($chunk, $brief)
                    : $this->companyBatchMessages($chunk, $brief),
                'options' => ['timeout' => 45, 'max_tokens' => 2600],
            ];
        }

        $responses = $this->glm->chatJsonPool($requests, 'extract', $organization);

        foreach ($chunks as $chunkIndex => $chunk) {
            $rows = $this->indexBatchRows($responses[$chunkIndex] ?? null, array_keys($chunk));

            foreach ($chunk as $index => $hit) {
                $row = $rows[$index] ?? null;
                $fallback = $this->fallbackRow($hit, $brief, $isPeople);

                if ($row === null) {
                    $extracted[$index] = $this->wrapExtractedRow($fallback);

                    continue;
                }

                $extracted[$index] = $this->wrapExtractedRow($isPeople
                    ? $this->normalizePersonRow($row, $hit, $brief, $fallback)
                    : $this->normalizeCompanyRow($row, $hit, $brief));
            }
        }

        ksort($extracted);

        return $extracted;
    }

    /**
     * @return array<string, mixed>
     */
    private function fallbackRow(RawDiscoveryHit $hit, IcpBrief $brief, bool $isPeople): array
    {
        return $isPeople ? $this->fallbackPerson($hit, $brief) : $this->fallbackCompany($hit);
    }

    /**
     * Mirror extractMany's contract: a row with no usable name yields nothing.
     *
     * @param  array<string, mixed>  $row
     * @return list<array<string, mixed>>
     */
    private function wrapExtractedRow(array $row): array
    {
        $name = trim((string) ($row['person_name'] ?? $row['name'] ?? ''));

        return $name === '' ? [] : [$row];
    }

    /**
     * @param  array<int, RawDiscoveryHit>  $chunk
     * @return list<array{role: string, content: string}>
     */
    private function companyBatchMessages(array $chunk, IcpBrief $brief): array
    {
        $hits = [];
        foreach ($chunk as $index => $hit) {
            $hits[] = [
                'index' => $index,
                'name' => $hit->name,
                'snippet' => $hit->snippet,
                'url' => $hit->url,
                'website' => $hit->website,
                'location' => $hit->location,
                'sector' => $hit->sector,
                'source' => $hit->source,
                'provider' => $hit->provider,
            ];
        }

        return [
            [
                'role' => 'system',
                'content' => 'Extract structured company intelligence for EVERY hit in hits[]. Return JSON: {"results":[{"index":<the hit index>,"name":"","sector":"","location":"","summary":"","contact_email":"","contact_phone":"","business_fields":{},"commercial_signals":[]}]}. One result per hit, echoing its index. The name must be a real company/organization name — never an article title, tip list, award, requirement phrase, blog post, or generic advice headline. If a hit is not a real company, set its name to an empty string. Never use the ICP profile name as the company name unless the hit explicitly refers to that exact company. Extract location and sector only from that hit\'s title, snippet, URL, or website — never copy ICP territories or industries, and never borrow another hit\'s location. If a hit does not name a place, set location to an empty string. Contact fields only when explicitly present in that hit; never invent; reject generic info@/contact@. No markdown.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'user_query' => $brief->query,
                    'icp' => [
                        'industries' => $brief->industries,
                        'territories' => $brief->territories,
                    ],
                    'hits' => $hits,
                ], JSON_UNESCAPED_UNICODE),
            ],
        ];
    }

    /**
     * @param  array<int, RawDiscoveryHit>  $chunk
     * @return list<array{role: string, content: string}>
     */
    private function personBatchMessages(array $chunk, IcpBrief $brief): array
    {
        $hits = [];
        foreach ($chunk as $index => $hit) {
            $hits[] = [
                'index' => $index,
                'name' => $hit->name,
                'snippet' => $hit->snippet,
                'url' => $hit->url,
            ];
        }

        return [
            [
                'role' => 'system',
                'content' => 'Extract person lead data for EVERY hit in hits[]. Return JSON: {"results":[{"index":<the hit index>,"person_name":"","title":"","company":"","linkedin_url":"","location":"","summary":"","email":"","phone":""}]}. One result per hit, echoing its index. Never use the ICP profile name as person_name. If a hit is an article/listicle with no identifiable person, set its person_name to an empty string. Location only from that hit; never borrow another hit\'s location. Email and phone only when explicitly present in that hit; never invent; reject generic info@/contact@. No markdown.',
            ],
            [
                'role' => 'user',
                'content' => json_encode([
                    'user_query' => $brief->query,
                    'hits' => $hits,
                ], JSON_UNESCAPED_UNICODE),
            ],
        ];
    }

    /**
     * Map a batch response back onto input indexes, trusting an echoed index when
     * present and falling back to response order.
     *
     * @param  array<string, mixed>|null  $response
     * @param  list<int>  $keys
     * @return array<int, array<string, mixed>>
     */
    private function indexBatchRows(?array $response, array $keys): array
    {
        if ($response === null) {
            return [];
        }

        $rows = $response['results'] ?? $response['hits'] ?? $response['people'] ?? [];
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
                    'content' => 'Extract structured company intelligence as JSON with keys: name, sector, location, summary, contact_email (only if explicitly present in the hit; never invent; reject generic info@/contact@), contact_phone (only if explicitly present; never invent), business_fields (object), commercial_signals (array of strings). The name must be a real company/organization name — never an article title, tip list, award, requirement phrase, blog post, or generic advice headline. If the hit is not a real company, set name to an empty string. Never use the ICP profile name as the company name unless the hit explicitly refers to that exact company. Extract location and sector only from the hit title, snippet, URL, or website — never copy ICP territories or industries. If the hit does not name a place, set location to an empty string. No markdown.',
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

            return $this->normalizeCompanyRow($result, $hit, $brief);
        } catch (\Throwable) {
            return $this->fallbackCompany($hit);
        }
    }

    /**
     * Shared post-processing for a model-extracted company row, single or batched.
     *
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function normalizeCompanyRow(array $result, RawDiscoveryHit $hit, IcpBrief $brief): array
    {
        if (($result['name'] ?? '') === $brief->name) {
            $result['name'] = $hit->name;
        }

        $companyName = trim((string) ($result['name'] ?? ''));
        if ($companyName === '' || $this->queryIntent->looksLikeContentOrGenericPhrase($companyName)) {
            return [
                'name' => '',
                'sector' => $result['sector'] ?? $hit->sector,
                'location' => $this->honestLocation($hit, $result['location'] ?? null),
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

        $result['location'] = $this->honestLocation($hit, $result['location'] ?? null);

        return $result;
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

            return $this->normalizePersonRow($result, $hit, $brief, $heuristic);
        } catch (\Throwable) {
            return $heuristic;
        }
    }

    /**
     * Shared post-processing for a model-extracted person row, single or batched.
     *
     * @param  array<string, mixed>  $result
     * @param  array<string, mixed>  $heuristic
     * @return array<string, mixed>
     */
    private function normalizePersonRow(array $result, RawDiscoveryHit $hit, IcpBrief $brief, array $heuristic): array
    {
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
            'location' => $this->honestLocation($hit, $result['location'] ?? null),
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
    }

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array, low_confidence?: bool}
     */
    private function fallbackCompany(RawDiscoveryHit $hit): array
    {
        $name = $hit->name;
        $location = $this->honestLocation($hit, null);
        if ($this->queryIntent->looksLikeContentOrGenericPhrase($name)) {
            return [
                'name' => '',
                'sector' => $hit->sector,
                'location' => $location,
                'summary' => $hit->snippet ?? '',
                'business_fields' => ['website' => $hit->website],
                'commercial_signals' => [],
                'low_confidence' => true,
            ];
        }

        $url = mb_strtolower((string) ($hit->url ?? ''));
        $hasCompanyProfile = str_contains($url, 'linkedin.com/company/');

        return [
            'name' => $name,
            'sector' => $hit->sector,
            'location' => $location,
            'summary' => $hit->snippet ?? $hit->name,
            'business_fields' => ['website' => $hit->website],
            'commercial_signals' => [],
            'linkedin_url' => $hasCompanyProfile ? $hit->url : null,
            // Valid company entities are high-confidence by default; advisory is decided in gates.
            'low_confidence' => false,
        ];
    }

    /**
     * Location only from the hit (or place names in title/snippet/URL) — never from the ICP.
     */
    private function honestLocation(RawDiscoveryHit $hit, mixed $extractedLocation): ?string
    {
        $haystack = trim($hit->name.' '.($hit->snippet ?? '').' '.($hit->url ?? '').' '.($hit->location ?? ''));
        $fromModel = is_string($extractedLocation) ? trim($extractedLocation) : '';

        if ($fromModel !== '' && $this->locationSupportedByHit($fromModel, $haystack)) {
            return $fromModel;
        }

        if (filled($hit->location)) {
            return trim((string) $hit->location);
        }

        return $this->discoveryGeo->inferLocationFromText($haystack);
    }

    private function locationSupportedByHit(string $location, string $haystack): bool
    {
        if (trim($haystack) === '') {
            return false;
        }

        $hay = mb_strtolower($haystack);
        if (str_contains($hay, mb_strtolower($location))) {
            return true;
        }

        $parts = preg_split('/[,\s\/]+/u', mb_strtolower($location)) ?: [];
        foreach ($parts as $part) {
            if (mb_strlen($part) >= 3 && str_contains($hay, $part)) {
                return true;
            }
        }

        return false;
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
            'location' => $this->honestLocation($hit, null),
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
