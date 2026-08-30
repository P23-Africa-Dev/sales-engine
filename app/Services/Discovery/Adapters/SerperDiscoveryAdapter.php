<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SerperDiscoveryAdapter implements DiscoverySourceInterface
{
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

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl.'/search', [
                    'q' => $query,
                    'num' => min(10, $ctx->limit),
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

            return collect($organic)->map(function (array $item) use ($brief) {
                $title = (string) ($item['title'] ?? 'Unknown');
                $name = preg_replace('/\s*[|\-–].*$/u', '', $title) ?: $title;

                return new RawDiscoveryHit(
                    name: trim($name),
                    source: 'web',
                    provider: 'serper',
                    website: isset($item['link']) ? parse_url((string) $item['link'], PHP_URL_HOST) : null,
                    location: $brief->territories[0] ?? null,
                    sector: $brief->industries[0] ?? null,
                    snippet: $item['snippet'] ?? null,
                    url: $item['link'] ?? null,
                    meta: ['title' => $title],
                );
            })->filter(fn (RawDiscoveryHit $h) => $h->name !== '')->values();
        } catch (\Throwable $e) {
            Log::warning('Serper search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
