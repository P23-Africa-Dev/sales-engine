<?php

namespace App\Services\Extraction;

use App\Models\Organization;
use App\Services\Discovery\Adapters\SerperPlacesDiscoveryAdapter;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\QueryIntentService;
use App\Services\Enrichment\DomainResolver;
use App\Services\Llm\GlmClient;
use App\Support\IcpMeaning;

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
     * @return array<int, list<array<string, mixed>>> Keyed by the input index.
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

            if (! $isPeople && $hit->provider === SerperPlacesDiscoveryAdapter::PROVIDER) {
                // Maps listings are already structured; the LLM would only lose the phone number.
                $extracted[$index] = $this->wrapExtractedRow($this->placesRow($hit));

                continue;
            }

            if ($isPeople) {
                $heuristic = $this->fallbackPerson($hit, $brief);
                if ($heuristic['not_a_person'] ?? false) {
                    $extracted[$index] = [];

                    continue;
                }
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
    /**
     * @return array<string, mixed>
     */
    private function placesRow(RawDiscoveryHit $hit): array
    {
        $phone = trim((string) ($hit->meta['phone'] ?? ''));

        return array_filter([
            'name' => $hit->name,
            'website' => $hit->website,
            'location' => $hit->location,
            'sector' => $hit->sector,
            'industry' => $hit->sector,
            'summary' => $hit->snippet,
            'phone' => $phone !== '' ? $phone : null,
            'phone_type' => $phone !== '' ? 'company_line' : null,
            'business_fields' => array_filter(['source_url' => $hit->url, 'address' => $hit->meta['address'] ?? null]),
            'commercial_signals' => [],
            'low_confidence' => false,
        ], static fn ($v): bool => $v !== null && $v !== '');
    }

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
                        'how_to_read' => IcpMeaning::SHORT,
                        'target_industries' => $brief->industries,
                        'target_territories' => $brief->territories,
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
                            'how_to_read' => IcpMeaning::SHORT,
                            'target_industries' => $brief->industries,
                            'target_territories' => $brief->territories,
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
                        'content' => 'Extract individual person names from a listicle search result. Return JSON: people (array of objects with person_name, title optional, company optional, summary optional — one unique sentence per person from the snippet, never the full listicle). Use real full names only (first and last name) — never invent, never return sentence fragments, channel names, article titles, or single generic words. Include title and company when mentioned near each name. Max '.$limit.' people. No markdown.',
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
        $text = trim(($hit->snippet ?? '')."\n".($hit->name ?? ''));
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
        if (! $this->isPresentablePersonName($personName)) {
            return [];
        }

        $summary = (string) ($result['summary'] ?? $hit->snippet ?? $hit->name);
        $title = trim((string) ($result['title'] ?? ''));
        $company = $this->identifyingCompany(trim((string) ($result['company'] ?? '')));
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

        if ($title !== '' && $company !== null) {
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
        ], fn ($v) => $v !== null && $v !== '');
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

        // The Serper adapter names LinkedIn hits from the URL slug; the real headline
        // ("Gbolahan Faniran – Founder/CEO – MinieMoney | LinkedIn") is kept in meta.title.
        $headline = trim((string) ($hit->meta['title'] ?? $hit->name));
        if ($linkedinUrl !== null) {
            $name = $this->betterNameFromHeadline($headline, $name);
            if ($this->isInitialsOnly($name)) {
                $first = trim((string) (preg_split('/\s+[\-–—|·]\s+/u', $headline)[0] ?? ''));
                $name = ! $this->isInitialsOnly($first) && preg_match('/^\p{Lu}[\p{L}\'.-]+(?:\s+\p{Lu}[\p{L}\'.-]+){1,3}$/u', $first) ? $first : '';
            }
            if (! str_contains(trim($name), ' ')) {
                // "fayombogabriel": a joined-up slug can't be split into first/last name reliably;
                // leave it to the model (or drop it) rather than show "Fayombogabriel".
                return [
                    'name' => '',
                    'person_name' => '',
                    'summary' => $hit->snippet ?? '',
                    'business_fields' => [],
                    'commercial_signals' => [],
                    'low_confidence' => true,
                ];
            }
        }

        // Headline first ("Name - Founder/CEO - Acme"), then the snippet. Only text that names a
        // real role counts as a title — taglines like "To grow, connect…" are not job titles.
        [$title, $company] = [null, null];
        if ($linkedinUrl !== null) {
            $rest = preg_replace('/\s*[|\-–—]\s*LinkedIn\s*$/iu', '', $headline) ?? $headline;
            $parts = preg_split('/\s+[\-–—|]\s+/u', $rest) ?: [];
            array_shift($parts);
            [$title, $company] = $this->titleAndCompanyFromSnippet(implode(' | ', $parts));
        }
        if ($title === null) {
            [$title, $company] = $this->titleAndCompanyFromSnippet((string) ($hit->snippet ?? ''));
        }
        if ($name === mb_strtoupper($name)) {
            $name = mb_convert_case(mb_strtolower($name), MB_CASE_TITLE, 'UTF-8');
        }
        if ($title !== null) {
            $title = $this->titleWithoutLeadingName($title, $name);
        }

        // Some businesses run personal LinkedIn profiles ("Honesty Agro-exports"); a name built
        // from business words is not a person to contact.
        $company = $company !== null ? $this->identifyingCompany($company) : null;
        if ($name !== '' && ! $this->isPresentablePersonName($name)) {
            return [
                'name' => '',
                'person_name' => '',
                'summary' => $hit->snippet ?? '',
                'business_fields' => [],
                'commercial_signals' => [],
                'low_confidence' => true,
                'not_a_person' => true,
            ];
        }

        if (preg_match('/\b(?:agro|exports?|imports?|trading|ventures|capital|ltd|limited|company|enterprises?|farms?|cooperative|co-?op|foundation|fund|group|holdings|industries|solutions|services|consult(?:ing|ants)?)\b/iu', $name)) {
            return [
                'name' => '',
                'person_name' => '',
                'summary' => $hit->snippet ?? '',
                'business_fields' => [],
                'commercial_signals' => [],
                'low_confidence' => true,
                'not_a_person' => true,
            ];
        }

        return array_filter([
            'name' => $name,
            'person_name' => $name,
            'title' => $title,
            'company' => $company,
            'linkedin_url' => $linkedinUrl,
            'location' => $this->honestLocation($hit, null),
            'summary' => $this->queryIntent->isListicleUrl($hit->url) ? '' : ($hit->snippet ?? $name),
            'business_fields' => array_filter([
                'source_url' => $hit->url,
                'linkedin_url' => $linkedinUrl,
            ]),
            'commercial_signals' => [],
            'low_confidence' => $lowConfidence,
        ], fn ($v) => $v !== null && $v !== '');
    }

    /**
     * LinkedIn result titles read "Jane Doe - Head of Sales - Acme Ltd | LinkedIn" or
     * "Jane Doe – CEO at Acme | LinkedIn". Recover the role and employer the LLM pass skips.
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function titleAndCompanyFromLinkedInHeadline(string $headline, string $personName): array
    {
        $headline = trim(preg_replace('/\s*[|\-–—]\s*LinkedIn\s*$/iu', '', $headline) ?? $headline);
        $parts = array_values(array_filter(array_map(
            'trim',
            preg_split('/\s+[\-–—|]\s+/u', $headline) ?: [],
        )));
        if ($parts !== [] && mb_strtolower($parts[0]) === mb_strtolower($personName)) {
            array_shift($parts);
        } elseif ($parts !== [] && str_contains(mb_strtolower($parts[0]), mb_strtolower(explode(' ', $personName)[0] ?? ''))) {
            array_shift($parts);
        }
        if ($parts === []) {
            return [null, null];
        }

        $title = $parts[0];
        $company = $parts[1] ?? null;
        if (preg_match('/^(.+?)\s+(?:at|@)\s+(.+)$/iu', $title, $m)) {
            $title = trim($m[1]);
            $company ??= trim($m[2]);
        }

        $title = mb_strlen($title) <= 80 ? $title : null;
        $company = $company !== null && mb_strlen($company) <= 80 && ! str_contains($company, '...') ? $company : null;

        return [$title, $company];
    }

    /**
     * "Gbolahanfaniran" (slug) → "Gbolahan Faniran" when the headline's first segment spells
     * the same letters; "Bukola A." style headlines keep the fuller slug name.
     */
    /**
     * "Charles Debrah Asante. Deputy Managing Director-Operations" → "Deputy Managing Director-Operations".
     * Snippets often open with the person's name; it must not end up inside the job title.
     */
    private function titleWithoutLeadingName(string $title, string $name): ?string
    {
        $title = trim($title);
        $name = trim($name);
        if ($name !== '' && mb_stripos($title, $name) === 0) {
            $title = ltrim(mb_substr($title, mb_strlen($name)), ' .,:;|·-–—');
        } elseif (preg_match('/^((?:\p{Lu}[\p{L}\'-]+\s+){1,3}\p{Lu}[\p{L}\'-]+)[.,:|·]\s+(.+)$/u', $title, $m) && ! $this->looksLikeRole($m[1])) {
            // "Firstname Lastname. Title" where the leading words are a name, not part of the role.
            $title = trim($m[2]);
        }

        return $title !== '' && $this->looksLikeRole($title) ? $title : null;
    }

    /**
     * Role and employer from a person's own LinkedIn search result
     * ("Ada Obi - Head of Compliance - Moniepoint | LinkedIn" + "Experience: Moniepoint · …").
     * Only values the result states; the employer must name one business.
     *
     * @return array{title: ?string, company: ?string}
     */
    public function roleFromProfileResult(string $resultTitle, string $snippet, string $name): array
    {
        $headline = preg_replace('/\s*[|\-–—]\s*LinkedIn\s*$/iu', '', trim($resultTitle)) ?? $resultTitle;
        $parts = preg_split('/\s+[\-–—|]\s+/u', $headline) ?: [];
        array_shift($parts);
        [$title, $company] = $parts !== [] ? $this->titleAndCompanyFromSnippet(implode(' | ', $parts)) : [null, null];
        [$snippetTitle, $snippetCompany] = $this->titleAndCompanyFromSnippet($snippet);
        $title ??= $snippetTitle;
        $company ??= $snippetCompany;
        if ($title !== null) {
            $title = $this->titleWithoutLeadingName($title, $name);
        }

        return [
            'title' => $title,
            'company' => $company !== null ? $this->identifyingCompany($company) : null,
        ];
    }

    /**
     * A name we can show a user: two to four words, none of them job or compliance jargon
     * that leaked in from a profile slug ("Simeon Julius Riskcontrol").
     */
    private function isPresentablePersonName(string $name): bool
    {
        $words = preg_split('/\s+/u', trim($name)) ?: [];
        if (count($words) < 2 || count($words) > 4) {
            return false;
        }

        return ! preg_match('/\b(?:risk\w*|\w*control|compliance|fraud|aml\w*|kyc|cft|analyst|investigator|manager|consultant|officer|ceo|cto|cfo|founder|finance|linkedin)\b/iu', $name);
    }

    /**
     * The company only when it names one business; "AML", "East Africa" or "Cocoa" picked
     * out of a headline would attach someone else's contacts and read as fact.
     */
    private function identifyingCompany(string $company): ?string
    {
        if ($company === '') {
            return null;
        }

        $resolver = app(DomainResolver::class);
        if ($resolver->companyTokens($company) === [] || $resolver->isGenericCompanyName($company)) {
            return null;
        }
        // "Country Manager Kenya", "Board Member", "… Sales Manager at Tiryaki Ghana": a role
        // fragment of the headline, not an employer.
        if (preg_match('/\b(?:manager|member|director|officer|head|lead|consultant|analyst|executive|founder|partner|principal|specialist|advisor|adviser|intern|student|at)\b/iu', $company)) {
            return null;
        }

        return $company;
    }

    private function isInitialsOnly(string $name): bool
    {
        $parts = preg_split('/\s+/u', trim($name)) ?: [];

        return $parts !== [] && collect($parts)->every(fn (string $part): bool => mb_strlen(rtrim($part, '.')) <= 1);
    }

    private function betterNameFromHeadline(string $headline, string $slugName): string
    {
        $first = trim((string) (preg_split('/\s+[\-–—|·]\s+/u', $headline)[0] ?? ''));
        $first = trim(preg_replace('/\s*\|\s*LinkedIn\s*$/iu', '', $first) ?? $first);
        // "Dr. Stanley Jacob FCIB" → "Stanley Jacob": honorifics and post-nominals are not the name.
        $first = trim(preg_replace('/^(?:Dr|Mr|Mrs|Ms|Miss|Engr|Prof|Chief|Sir|Hon|Arc|Pst|Barr)\.?\s+/u', '', $first) ?? $first);
        $first = trim(preg_replace('/(?:,?\s+(?:\p{Lu}{2,6}|Ph\.?D|MBA|ACA|FCA|CFA|PMP))+$/u', '', $first) ?? $first);
        if ($first === '' || mb_strlen($first) > 60 || ! preg_match('/^\p{Lu}[\p{L}\'.-]*(?:\s+\p{Lu}[\p{L}\'.-]*){1,3}$/u', $first)) {
            return $slugName;
        }

        $letters = static fn (string $value): string => preg_replace('/[^\p{L}]/u', '', mb_strtolower($value)) ?? '';
        $headlineLetters = $letters($first);
        $slugLetters = $letters($slugName);
        if ($headlineLetters === '' || mb_strlen($headlineLetters) < 5 || str_contains($first, '.')) {
            return $slugName;
        }

        if (str_contains($slugLetters, $headlineLetters)) {
            return $first;
        }

        // Handles like "hidalgo1" or "javiermrosas": the slug is not a name, the headline is.
        $slugIsHandle = ! str_contains(trim($slugName), ' ') || preg_match('/\d/u', $slugName);
        $sharesSurname = collect(preg_split('/\s+/u', mb_strtolower($first)) ?: [])
            ->contains(fn (string $part): bool => mb_strlen($part) >= 3 && str_contains($slugLetters, preg_replace('/[^\p{L}]/u', '', $part) ?? ''));

        return $slugIsHandle && $sharesSurname ? $first : $slugName;
    }

    /**
     * Role and employer from a LinkedIn snippet: "Managing Director & CEO | SaySwitch Limited | …",
     * "Founder/CEO MinieMoney.", "Founder/Group CEO of VALUEPAY HOLDINGS", "Experience: Flexfees".
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function titleAndCompanyFromSnippet(string $snippet): array
    {
        $snippet = trim(preg_replace('/\s+/u', ' ', $snippet) ?? $snippet);
        if ($snippet === '') {
            return [null, null];
        }

        $role = '(?:(?:Co-?)?Founder|Owner|Partner|President|Chairman|(?:Group |Deputy |Executive )?(?:Managing Director|MD|CEO|CTO|CFO|COO|CMO|CIO|CPO)|Chief [A-Z][a-z]+(?: [A-Z][a-z]+)? Officer|Head of [A-Z][\w&]*(?: [A-Z&][\w&]*){0,3}|(?:Senior |Executive )?Vice President[\w ,&]{0,30}?|VP(?: of)? [A-Z][\w&]*(?: [A-Z&][\w&]*){0,2}|(?:\p{Lu}[\p{L}&-]+ ){0,3}(?:Director|Manager|Principal|Associate|Analyst|Lead)(?: of \p{Lu}[\w&]*(?: \p{Lu}[\w&]*){0,2})?)';
        $title = null;
        $company = null;

        // LinkedIn's own shape: "[Name ·] Import Export Manager at Olam · Experience: …" or
        // "Principal @ Prosper Global Ventures (formerly …)". Keep the whole title phrase.
        foreach (preg_split('/\s*[·|]\s*/u', $snippet) ?: [] as $segment) {
            if (preg_match('/^(\p{Lu}[\p{L}&\/,.\'\- ]{1,70}?)\s+(?:at|@)\s+(\p{Lu}[\p{L}\p{N}&.\'\- ]{1,60}?)\s*(?:\(|\.\s|\.$|$)/u', trim($segment), $m)
                && $this->looksLikeRole($m[1])) {
                $title = trim($m[1], ' ,.');
                $company = trim($m[2], ' ,.');
                break;
            }
        }

        // "Name · Title | Company | …" or "Title | Company | …"
        $segments = array_values(array_filter(array_map('trim', preg_split('/\s*[|·]\s*/u', $snippet) ?: [])));
        foreach ($title === null ? $segments : [] as $index => $segment) {
            if (preg_match('/^(?:'.$role.')(?:\s*(?:&|and|\/)\s*(?:'.$role.'))*$/u', $segment)) {
                $title = $segment;
                $next = $segments[$index + 1] ?? null;
                if (is_string($next) && preg_match('/^\p{Lu}[\w&.\'-]*(?:\s+[\p{Lu}&(][\w&.()\'-]*){0,5}$/u', $next)) {
                    $company = $next;
                }
                break;
            }
        }

        // "Founder/CEO MinieMoney." / "CEO at Acme" / "Founder/Group CEO of VALUEPAY HOLDINGS"
        if ($title === null && preg_match('/\b((?:'.$role.')(?:\s*(?:&|and|\/)\s*(?:'.$role.'))*)\s*(?:at|of|@|,|-|–)?\s+(\p{Lu}[\w&.\'-]*(?:\s+\p{Lu}[\w&.\'-]*){0,4})/u', $snippet, $m)) {
            $title = trim($m[1]);
            $company = trim($m[2], ' .,;');
        }

        if ($company === null && preg_match('/\bExperience:\s*(\p{Lu}[\w&.\'-]*(?:\s+\p{Lu}[\w&.\'-]*){0,4})/u', $snippet, $m)) {
            $company = trim($m[1], ' .,;');
        }

        if ($company !== null) {
            $company = trim(preg_split('/\.\s|\s[|·]\s/u', $company)[0] ?? $company, ' .,;');
            // "CIO | CTO" or "Player-Coach Sales Leader": a role or tagline is not an employer,
            // and a wrong employer means wrong contact details.
            if (
                preg_match('/^(?:'.$role.')(?:\s*(?:&|and|\/)\s*(?:'.$role.'))*$/u', $company)
                || preg_match('/\b(leader|coach|expert|specialist|consultant|advisor|adviser|mentor|speaker|enthusiast|strategist|evangelist|transformation|helping|passionate|driving|building|growth)\b/iu', $company)
            ) {
                $company = null;
            }
        }
        $title = $title !== null && mb_strlen($title) <= 80 ? $title : null;
        $company = $company !== null && mb_strlen($company) >= 2 && mb_strlen($company) <= 80 ? $company : null;

        return [$title, $company];
    }

    /**
     * A job title, not a tagline: names a role somewhere in the phrase.
     */
    private function looksLikeRole(string $phrase): bool
    {
        if (mb_strlen($phrase) > 70 || preg_match('/\b(helping|passionate|driving|building|love|i\s|we\s)\b/iu', $phrase)) {
            return false;
        }

        return (bool) preg_match('/\b(ceo|cto|cfo|coo|cmo|cio|cpo|md|gm|vp|chief|founder|co-founder|owner|partner|principal|president|chair(?:man|person)?|director|manager|head|officer|lead|associate|analyst|engineer|consultant|specialist|coordinator|executive|exporter|trader|buyer|investor|controller|treasurer|secretary)\b/iu', $phrase);
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
        $haystack = trim($snippet.' '.$title);
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
