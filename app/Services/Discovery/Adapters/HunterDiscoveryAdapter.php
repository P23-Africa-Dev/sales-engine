<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Hunter Discover — free company search (does not burn email finder credits).
 */
class HunterDiscoveryAdapter implements DiscoverySourceInterface
{
    public function __construct(
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    public function key(): string
    {
        return 'hunter';
    }

    public function isEnabled(): bool
    {
        return trim((string) config('services.hunter.api_key')) !== '';
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled()) {
            return collect();
        }

        $query = trim($brief->searchQuery());
        if ($query === '') {
            return collect();
        }

        $apiKey = (string) config('services.hunter.api_key');
        $payload = $this->buildDiscoverPayload($query, $brief);

        try {
            $response = Http::timeout(30)
                ->acceptJson()
                ->asJson()
                ->post('https://api.hunter.io/v2/discover?api_key='.urlencode($apiKey), $payload);

            try {
                ApiUsage::query()->create([
                    'organization_id' => $ctx->organizationId,
                    'provider' => 'hunter',
                    'endpoint' => 'discover',
                    'units' => 1,
                    'estimated_cost' => 0.0,
                    'meta' => [
                        'status' => $response->status(),
                        'query' => $query,
                        'error' => $response->successful() ? null : mb_substr($response->body(), 0, 240),
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::debug('Hunter ApiUsage write skipped', ['error' => $e->getMessage()]);
            }

            if (! $response->successful()) {
                Log::warning('Hunter Discover failed', [
                    'status' => $response->status(),
                    'body' => mb_substr($response->body(), 0, 400),
                ]);

                return collect();
            }

            $items = $response->json('data') ?? [];
            if (! is_array($items)) {
                return collect();
            }

            $registryCap = $ctx->limit <= 40
                ? min(40, max(1, $ctx->limit * 3))
                : max(1, (int) ceil($ctx->limit * 1.5));

            return collect($items)
                ->take($registryCap)
                ->map(function ($item) use ($brief) {
                    $row = is_array($item) ? $item : [];
                    $name = trim((string) ($row['organization'] ?? $row['company'] ?? $row['name'] ?? ''));
                    if ($name === '') {
                        return null;
                    }

                    $domain = trim((string) ($row['domain'] ?? $row['website'] ?? ''));
                    $url = $domain !== ''
                        ? (str_starts_with($domain, 'http') ? $domain : 'https://'.$domain)
                        : null;

                    $locationParts = array_filter([
                        $row['city'] ?? null,
                        $row['state'] ?? null,
                        $row['country'] ?? null,
                    ], fn ($v) => filled($v));

                    return new RawDiscoveryHit(
                        name: $name,
                        source: 'database',
                        provider: 'hunter',
                        website: $domain !== '' ? preg_replace('#^https?://#i', '', $domain) : null,
                        location: $locationParts !== []
                            ? implode(', ', $locationParts)
                            : null,
                        sector: isset($row['industry']) ? (string) $row['industry'] : null,
                        snippet: isset($row['description']) ? (string) $row['description'] : null,
                        url: $url,
                        externalId: isset($row['domain']) ? (string) $row['domain'] : null,
                        meta: $row,
                    );
                })
                ->filter()
                ->values();
        } catch (\Throwable $e) {
            Log::warning('Hunter Discover exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function buildDiscoverPayload(string $query, IcpBrief $brief): array
    {
        $payload = ['query' => $query];

        if ($this->discoveryGeo->shouldApplyRetrievalGeo($brief)) {
            $locations = $this->discoveryGeo->hunterHeadquarters($brief);
            if ($locations !== []) {
                $payload['headquarters_location'] = [
                    'include' => $locations,
                ];
            }
        }

        return $payload;
    }
}
