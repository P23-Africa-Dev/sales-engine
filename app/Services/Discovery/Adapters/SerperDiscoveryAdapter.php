<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
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
    public function __construct(
        private readonly QueryIntentService $queryIntent,
        private readonly PersonNameValidator $personNameValidator,
    ) {}

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

        $query = $this->sanitizeQuery($brief->searchQuery());
        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $resultLimit = $this->resolveResultLimit($brief, $ctx);

        try {
            $response = $this->postSearch($baseUrl, $query, $resultLimit);

            // Free Serper plans reject complex patterns when num is high — retry once with safer settings.
            if ($this->isFreeTierPatternBlock($response) && ($resultLimit > 10 || $this->looksComplex($query))) {
                $safeQuery = $this->simplifyQuery($query);
                $safeLimit = min(10, $resultLimit);
                Log::info('Serper free-tier pattern block; retrying with safer query/num', [
                    'original_query' => $query,
                    'safe_query' => $safeQuery,
                    'original_num' => $resultLimit,
                    'safe_num' => $safeLimit,
                ]);
                $response = $this->postSearch($baseUrl, $safeQuery, $safeLimit);
                $query = $safeQuery;
                $resultLimit = $safeLimit;
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
                        'query' => $query,
                        'num' => $resultLimit,
                        'error' => $response->successful() ? null : mb_substr($response->body(), 0, 240),
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::debug('Serper ApiUsage write skipped', ['error' => $e->getMessage()]);
            }

            if (! $response->successful()) {
                Log::warning('Serper search failed', ['status' => $response->status(), 'body' => $response->body()]);

                return collect();
            }

            $organic = $response->json('organic') ?? [];

            $hits = collect($organic)
                ->map(function (array $item) use ($brief) {
                    $title = (string) ($item['title'] ?? 'Unknown');
                    $url = $item['link'] ?? null;
                    $name = $this->resolveHitName($title, $url, $brief);

                    return new RawDiscoveryHit(
                        name: trim($name),
                        source: 'web',
                        provider: 'serper',
                        website: isset($item['link']) ? parse_url((string) $item['link'], PHP_URL_HOST) : null,
                        location: $brief->territories[0] ?? null,
                        sector: $brief->industries[0] ?? null,
                        snippet: $item['snippet'] ?? null,
                        url: $url,
                        meta: ['title' => $title, 'target' => $brief->target],
                    );
                })
                ->filter(function (RawDiscoveryHit $h) use ($brief) {
                    if ($h->name === '') {
                        return false;
                    }

                    $allowListicle = $brief->isPeopleSearch() || $brief->isListiclePeopleQuery() || $brief->isAuthoritativePeopleQuery();

                    if (! $allowListicle && $this->queryIntent->isListicleUrl($h->url)) {
                        return false;
                    }

                    if (! $allowListicle && $this->queryIntent->looksLikeContentOrGenericPhrase($h->name)) {
                        return false;
                    }

                    return true;
                });

            if ($brief->isAuthoritativePeopleQuery()) {
                $hits = $this->rankAuthoritativeHits($hits);
            }

            return $hits->values();
        } catch (\Throwable $e) {
            Log::warning('Serper search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }

    private function resolveResultLimit(IcpBrief $brief, SearchContext $ctx): int
    {
        $configuredMax = max(5, min(100, (int) config('services.serper.max_results', 10)));

        $desired = match (true) {
            $brief->isAuthoritativePeopleQuery() => max(10, min(20, $ctx->limit)),
            $ctx->limit >= 20 => 20,
            default => min(10, max(5, $ctx->limit)),
        };

        return min($configuredMax, $desired);
    }

    private function postSearch(string $baseUrl, string $query, int $num): Response
    {
        return Http::timeout(30)
            ->withHeaders([
                'X-API-KEY' => (string) config('services.serper.api_key'),
                'Content-Type' => 'application/json',
            ])
            ->post($baseUrl.'/search', [
                'q' => $query,
                'num' => $num,
            ]);
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
            $normalized = $this->personNameValidator->normalizePersonName($trimmed);

            return $normalized !== '' ? $normalized : $trimmed;
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

            if (preg_match('/\b(top|richest|wealthiest|billionaires?)\b/u', mb_strtolower($hit->name.' '.($hit->snippet ?? '')))) {
                $score += 20;
            }

            return $score;
        })->values();
    }
}
