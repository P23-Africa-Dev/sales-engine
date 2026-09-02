<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SerperDiscoveryAdapter implements DiscoverySourceInterface
{
    public function __construct(private readonly QueryIntentService $queryIntent) {}

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

        $query = $brief->searchQuery();
        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $resultLimit = $brief->isAuthoritativePeopleQuery()
            ? min(15, max($ctx->limit, 10))
            : min(10, $ctx->limit);

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl.'/search', [
                    'q' => $query,
                    'num' => $resultLimit,
                ]);

            ApiUsage::query()->create([
                'organization_id' => $ctx->organizationId,
                'provider' => 'serper',
                'endpoint' => 'search',
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => ['status' => $response->status(), 'query' => $query],
            ]);

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

                    if (! $allowListicle && $this->queryIntent->looksLikeArticleTitle($h->name)) {
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

    private function resolveHitName(string $title, ?string $url, IcpBrief $brief): string
    {
        if ($brief->isPeopleSearch() && filled($url) && str_contains(mb_strtolower($url), 'linkedin.com/in/')) {
            $path = parse_url($url, PHP_URL_PATH) ?? '';
            if (preg_match('#/in/([^/?]+)#', $path, $matches)) {
                $slug = str_replace(['-', '_'], ' ', $matches[1]);

                return ucwords($slug);
            }
        }

        $name = preg_replace('/\s*[|\-–].*$/u', '', $title) ?: $title;

        return trim((string) $name);
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
