<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DiscoveryProviderHealth;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SerperDiscoveryAdapter implements DiscoverySourceInterface
{
    /** Concurrent searches per wave. A multi-country plan must not be paced four at a time. */
    private const POOL_SIZE = 8;

    public function __construct(
        private readonly QueryIntentService $queryIntent,
        private readonly PersonNameValidator $personNameValidator,
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
        private readonly ?DiscoveryProviderHealth $health = null,
    ) {}

    private function health(): DiscoveryProviderHealth
    {
        return $this->health ?? app(DiscoveryProviderHealth::class);
    }

    public function key(): string
    {
        return 'serper';
    }

    public function isEnabled(): bool
    {
        return trim((string) config('services.serper.api_key')) !== '';
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled()) {
            return collect();
        }

        return $this->searchMany([$brief->searchQuery()], $brief, $ctx);
    }

    /**
     * Parallel Serper fan-out for faster first-batch discovery.
     *
     * Entries may be plain query strings (inheriting the brief's geography) or
     * ['q' => string, 'gl' => ?string, 'location' => ?string, 'region' => ?string] so a
     * single wave can cover every selected country instead of one country per pass.
     *
     * @param  list<string|array{q: string, gl?: ?string, location?: ?string, region?: ?string}>  $queries
     * @return Collection<int, RawDiscoveryHit>
     */
    public function searchMany(array $queries, IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled() || $queries === []) {
            return collect();
        }

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $resultLimit = $this->resolveResultLimit($brief, $ctx);
        $briefGeo = $this->serperGeoParams($brief);
        $hits = collect();
        $plan = $this->buildQueryPlan($queries, $briefGeo);

        foreach (array_chunk($plan, self::POOL_SIZE) as $chunk) {
            $responses = Http::pool(function ($pool) use ($chunk, $baseUrl, $resultLimit) {
                foreach ($chunk as $index => $entry) {
                    $pool->as((string) $index)
                        ->timeout(30)
                        ->withHeaders([
                            'X-API-KEY' => (string) config('services.serper.api_key'),
                            'Content-Type' => 'application/json',
                        ])
                        ->post($baseUrl . '/search', $this->searchPayload($entry['q'], $resultLimit, $entry['geo']));
                }
            });

            foreach ($chunk as $index => $entry) {
                $query = $entry['q'];
                $geoParams = $entry['geo'];
                $region = $entry['region'];
                $response = $responses[(string) $index] ?? null;
                if (! $response instanceof Response) {
                    continue;
                }

                $activeQuery = $query;
                $activeLimit = $resultLimit;

                if ($this->isFreeTierPatternBlock($response) && ($resultLimit > 10 || $this->looksComplex($query))) {
                    $safeQuery = $this->simplifyQuery($query);
                    $safeLimit = min(10, $resultLimit);
                    Log::info('Serper free-tier pattern block; retrying with safer query/num', [
                        'original_query' => $query,
                        'safe_query' => $safeQuery,
                        'original_num' => $resultLimit,
                        'safe_num' => $safeLimit,
                    ]);
                    $response = $this->postSearch($baseUrl, $safeQuery, $safeLimit, $geoParams);
                    $activeQuery = $safeQuery;
                    $activeLimit = $safeLimit;
                }

                try {
                    ApiUsage::query()->create([
                        'organization_id' => $ctx->organizationId,
                        'provider' => 'serper',
                        'endpoint' => 'search',
                        'units' => 1,
                        'estimated_cost' => 0.005,
                        'meta' => [
                            'status' => $response->status(),
                            'query' => $activeQuery,
                            'num' => $activeLimit,
                            'error' => $response->successful() ? null : mb_substr($response->body(), 0, 240),
                        ],
                    ]);
                } catch (\Throwable $e) {
                    Log::debug('Serper ApiUsage write skipped', ['error' => $e->getMessage()]);
                }

                if (! $response->successful()) {
                    $this->health()->recordFailure('serper', $response->status(), $response->body());
                    Log::warning('Serper search failed', ['status' => $response->status(), 'body' => $response->body()]);

                    continue;
                }

                $this->health()->recordSuccess('serper');

                $variantBrief = $brief->withSearchQueryOverride($activeQuery);
                $mapped = $this->mapOrganicHits($response->json('organic') ?? [], $variantBrief, $ctx);
                if ($region !== null) {
                    $mapped = $mapped->map(fn(RawDiscoveryHit $hit): RawDiscoveryHit => $hit->withRegion($region));
                }
                $hits = $hits->merge($mapped);
            }
        }

        if ($brief->isAuthoritativePeopleQuery()) {
            $hits = $this->rankAuthoritativeHits($hits);
        }

        return $hits->values();
    }

    /**
     * @param  list<array<string, mixed>>  $organic
     * @return Collection<int, RawDiscoveryHit>
     */
    private function mapOrganicHits(array $organic, IcpBrief $brief, SearchContext $ctx): Collection
    {
        $isResearch = $ctx->intent === 'quick_research';

        return collect($organic)
            ->map(function (array $item) use ($brief) {
                $title = (string) ($item['title'] ?? 'Unknown');
                $url = $item['link'] ?? null;
                $snippet = $item['snippet'] ?? null;
                $name = $this->resolveHitName($title, $url, $brief);
                $haystack = trim($title . ' ' . (string) $snippet . ' ' . (string) $url);
                $inferredLocation = $this->discoveryGeo->inferLocationFromText($haystack);

                return new RawDiscoveryHit(
                    name: trim($name),
                    source: 'web',
                    provider: 'serper',
                    website: isset($item['link']) ? parse_url((string) $item['link'], PHP_URL_HOST) : null,
                    location: $inferredLocation,
                    sector: null,
                    snippet: $snippet,
                    url: $url,
                    meta: ['title' => $title, 'target' => $brief->target],
                );
            })
            ->filter(function (RawDiscoveryHit $h) use ($brief, $isResearch) {
                if ($h->name === '') {
                    return false;
                }

                // Research briefs need market reports / articles as sources — do not apply lead junk filters.
                if ($isResearch) {
                    return true;
                }

                $allowListicle = $brief->isPeopleSearch() || $brief->isListiclePeopleQuery() || $brief->isAuthoritativePeopleQuery();
                $urlLower = mb_strtolower((string) ($h->url ?? ''));

                // Drop LinkedIn posts/pulse and research hosts before gather.
                // Listicle / authoritative people searches still need article sources.
                if ($this->isNonEntityLeadUrl($urlLower) && ! $allowListicle) {
                    return false;
                }

                $isCompanyLinkedIn = $brief->isCompanySearch() && str_contains($urlLower, 'linkedin.com/company/');
                $looksLikeCompanyHomepage = $brief->isCompanySearch() && $this->looksLikeCompanyHomepage($urlLower);

                // Company searches should keep account pages, not person profiles.
                if ($brief->isCompanySearch() && str_contains($urlLower, 'linkedin.com/in/')) {
                    return false;
                }

                // People searches should keep person profiles, not company pages.
                if ($brief->isPeopleSearch() && str_contains($urlLower, 'linkedin.com/company/')) {
                    return false;
                }

                // Company mode: keep LinkedIn company pages and plausible company homepages even
                // when the URL path looks like a directory/listicle host.
                if (! $allowListicle && ! $isCompanyLinkedIn && ! $looksLikeCompanyHomepage && $this->queryIntent->isListicleUrl($h->url)) {
                    // Soften: keep directory hits when the resolved name looks like a real company.
                    if (
                        ! $brief->isCompanySearch()
                        || $this->queryIntent->looksLikeContentOrGenericPhrase($h->name)
                        || ! $this->looksLikeCompanyName($h->name)
                    ) {
                        return false;
                    }
                }

                if (! $allowListicle && ! $isCompanyLinkedIn && $this->queryIntent->looksLikeContentOrGenericPhrase($h->name)) {
                    // Soften for company search: "list of X" titles still drop, but short
                    // Title Case company names with a homepage URL survive.
                    if (! ($brief->isCompanySearch() && $looksLikeCompanyHomepage && $this->looksLikeCompanyName($h->name))) {
                        return false;
                    }
                }

                return true;
            });
    }

    private function looksLikeCompanyHomepage(string $urlLower): bool
    {
        if ($urlLower === '' || str_contains($urlLower, 'linkedin.com/')) {
            return false;
        }

        $path = parse_url($urlLower, PHP_URL_PATH) ?? '/';
        $path = rtrim($path, '/') ?: '/';

        // Root or shallow marketing pages — not /blog/top-10-...
        if ($path === '/' || preg_match('#^/(about|about-us|home|index|company|contact)?$#u', $path)) {
            return true;
        }

        return false;
    }

    /**
     * LinkedIn posts/pulse and research hosts rarely yield creatable company/person leads.
     */
    private function isNonEntityLeadUrl(string $urlLower): bool
    {
        if ($urlLower === '') {
            return false;
        }

        if (preg_match('~linkedin\.com/(pulse|posts|feed|recent-activity)\b~', $urlLower)) {
            return true;
        }

        if (preg_match('~activity-\d~', $urlLower)) {
            return true;
        }

        return (bool) preg_match(
            '~(kenresearch|statista\.com|wikipedia\.org|market-research|market-report)~',
            $urlLower,
        );
    }

    private function looksLikeCompanyName(string $name): bool
    {
        $trimmed = trim($name);
        if ($trimmed === '' || mb_strlen($trimmed) < 3 || mb_strlen($trimmed) > 80) {
            return false;
        }

        if ($this->queryIntent->looksLikeContentOrGenericPhrase($trimmed)) {
            return false;
        }

        // Prefer names that look like brands (Title Case / Ltd / Limited / Capital / Finance).
        if (preg_match('/\b(ltd|limited|llc|inc|plc|corp|corporation|company|capital|finance|bank|loans?|advances?)\b/iu', $trimmed)) {
            return true;
        }

        $words = preg_split('/\s+/u', $trimmed) ?: [];
        if (count($words) >= 1 && count($words) <= 6) {
            $titleish = 0;
            foreach ($words as $word) {
                if (preg_match('/^[\p{Lu}]/u', $word)) {
                    $titleish++;
                }
            }

            return $titleish >= max(1, (int) ceil(count($words) / 2));
        }

        return false;
    }

    private function resolveResultLimit(IcpBrief $brief, SearchContext $ctx): int
    {
        $configuredMax = max(5, min(100, (int) config('services.serper.max_results', 20)));

        $desired = match (true) {
            $brief->isAuthoritativePeopleQuery() => max(10, min(20, $ctx->limit)),
            $ctx->limit > 20 => min(30, max(20, (int) ceil($ctx->limit / 2))),
            $ctx->limit >= 20 => 20,
            $ctx->limit >= 12 => 15,
            default => min(10, max(5, $ctx->limit)),
        };

        return min($configuredMax, $desired);
    }

    /**
     * Normalize mixed query input into one pooled plan, deduped on query plus geography
     * so the same phrase can legitimately run once per country.
     *
     * @param  list<string|array<string, mixed>>  $queries
     * @param  array<string, string>  $briefGeo
     * @return list<array{q: string, geo: array<string, string>, region: ?string}>
     */
    private function buildQueryPlan(array $queries, array $briefGeo): array
    {
        $plan = [];
        $seen = [];

        foreach ($queries as $entry) {
            if (is_array($entry)) {
                $query = $this->sanitizeQuery((string) ($entry['q'] ?? ''));
                $geo = array_filter([
                    'location' => trim((string) ($entry['location'] ?? '')),
                    'gl' => trim((string) ($entry['gl'] ?? '')),
                ], static fn(string $value): bool => $value !== '');
                $region = isset($entry['region']) && trim((string) $entry['region']) !== ''
                    ? trim((string) $entry['region'])
                    : null;
            } else {
                $query = $this->sanitizeQuery((string) $entry);
                $geo = $briefGeo;
                $region = null;
            }

            if ($query === '') {
                continue;
            }

            $key = mb_strtolower($query).'|'.($geo['gl'] ?? '').'|'.($geo['location'] ?? '');
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $plan[] = ['q' => $query, 'geo' => $geo, 'region' => $region];
        }

        return $plan;
    }

    /**
     * @return array<string, string>
     */
    private function serperGeoParams(IcpBrief $brief): array
    {
        if (! $this->discoveryGeo->shouldApplyRetrievalGeo($brief)) {
            return [];
        }

        $params = $this->discoveryGeo->serperParams($brief);

        return array_filter(
            [
                'location' => isset($params['location']) ? trim((string) $params['location']) : '',
                'gl' => isset($params['gl']) ? trim((string) $params['gl']) : '',
            ],
            static fn(string $value): bool => $value !== '',
        );
    }

    /**
     * @param  array<string, string>  $geoParams
     * @return array<string, mixed>
     */
    private function searchPayload(string $query, int $num, array $geoParams): array
    {
        return array_merge([
            'q' => $query,
            'num' => $num,
        ], $geoParams);
    }

    /**
     * @param  array<string, string>  $geoParams
     */
    private function postSearch(string $baseUrl, string $query, int $num, array $geoParams = []): Response
    {
        return Http::timeout(30)
            ->withHeaders([
                'X-API-KEY' => (string) config('services.serper.api_key'),
                'Content-Type' => 'application/json',
            ])
            ->post($baseUrl . '/search', $this->searchPayload($query, $num, $geoParams));
    }

    private function isFreeTierPatternBlock(Response $response): bool
    {
        if ($response->status() !== 400) {
            return false;
        }

        $message = mb_strtolower((string) ($response->json('message') ?? $response->body()));

        return str_contains($message, 'query pattern not allowed')
            || str_contains($message, 'free accounts');
    }

    private function looksComplex(string $query): bool
    {
        return str_contains($query, '"')
            || str_contains($query, '(')
            || str_contains(mb_strtolower($query), ' site:')
            || str_contains($query, ' OR ');
    }

    /**
     * Soften queries that Serper free accounts reject when paired with higher num.
     */
    private function sanitizeQuery(string $query): string
    {
        $query = trim($query);
        // Decision-maker titles like "Managing Director / CEO" → Managing Director CEO
        $query = preg_replace('/\s*\/\s*/u', ' ', $query) ?? $query;
        $query = preg_replace('/\s+/u', ' ', $query) ?? $query;

        return trim($query);
    }

    private function simplifyQuery(string $query): string
    {
        $q = $this->sanitizeQuery($query);
        // Drop site: operators and quoted phrases / OR groups that free accounts reject at higher num.
        $q = preg_replace('/\bsite:[^\s]+/iu', ' ', $q) ?? $q;
        $q = str_replace(['(', ')'], ' ', $q);
        $q = preg_replace('/"/u', ' ', $q) ?? $q;
        $q = preg_replace('/\bOR\b/u', ' ', $q) ?? $q;
        $q = preg_replace('/\s+/u', ' ', $q) ?? $q;

        return trim($q);
    }

    private function resolveHitName(string $title, ?string $url, IcpBrief $brief): string
    {
        if ($brief->isPeopleSearch() && filled($url) && str_contains(mb_strtolower($url), 'linkedin.com/in/')) {
            $path = parse_url($url, PHP_URL_PATH) ?? '';
            if (preg_match('#/in/([^/?]+)#', $path, $matches)) {
                $slug = str_replace(['-', '_'], ' ', $matches[1]);
                $fromSlug = $this->personNameValidator->normalizePersonName(ucwords($slug));

                return $fromSlug !== '' ? $fromSlug : ucwords($slug);
            }
        }

        $name = preg_replace('/\s*[|\-–].*$/u', '', $title) ?: $title;
        $trimmed = trim((string) $name);

        if ($brief->isPeopleSearch()) {
            // People search: only promote title text when it looks like a real person.
            // Market-report / category titles must not become Lead.name.
            // Authoritative listicle articles keep their title so snippet extraction can run.
            if ($this->queryIntent->looksLikeContentOrGenericPhrase($trimmed)) {
                if ($brief->isAuthoritativePeopleQuery() || $brief->isListiclePeopleQuery()) {
                    return $trimmed;
                }

                return '';
            }

            $normalized = $this->personNameValidator->normalizePersonName($trimmed);
            $candidate = $normalized !== '' ? $normalized : $trimmed;

            if (! $this->personNameValidator->isValidPersonName($candidate, [
                'linkedin_url' => (filled($url) && str_contains(mb_strtolower((string) $url), 'linkedin.com/in/'))
                    ? $url
                    : null,
            ])) {
                // Without a LinkedIn /in/ corroboration, drop non-person titles.
                if (! filled($url) || ! str_contains(mb_strtolower((string) $url), 'linkedin.com/in/')) {
                    if ($brief->isAuthoritativePeopleQuery() || $brief->isListiclePeopleQuery()) {
                        return $trimmed;
                    }

                    return '';
                }
            }

            return $candidate;
        }

        return $trimmed;
    }

    /**
     * @param  Collection<int, RawDiscoveryHit>  $hits
     * @return Collection<int, RawDiscoveryHit>
     */
    private function rankAuthoritativeHits(Collection $hits): Collection
    {
        $authoritativeDomains = [
            'forbes.com',
            'bloomberg.com',
            'wikipedia.org',
            'visualcapitalist.com',
            'statista.com',
            'cnbc.com',
            'reuters.com',
        ];

        return $hits->sortByDesc(function (RawDiscoveryHit $hit) use ($authoritativeDomains): int {
            $host = mb_strtolower((string) parse_url((string) $hit->url, PHP_URL_HOST));
            $score = 0;

            foreach ($authoritativeDomains as $index => $domain) {
                if (str_contains($host, $domain)) {
                    $score += 100 - $index;
                }
            }

            if (preg_match('/\b(top|richest|wealthiest|billionaires?)\b/u', mb_strtolower($hit->name . ' ' . ($hit->snippet ?? '')))) {
                $score += 20;
            }

            return $score;
        })->values();
    }
}
