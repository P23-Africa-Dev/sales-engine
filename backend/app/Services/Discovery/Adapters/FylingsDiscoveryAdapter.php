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

class FylingsDiscoveryAdapter implements DiscoverySourceInterface
{
    public function key(): string
    {
        return 'fylings';
    }

    public function isEnabled(): bool
    {
        return trim((string) config('services.fylings.api_key')) !== '';
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled()) {
            return collect();
        }

        $query = $brief->searchQuery();
        $baseUrl = rtrim((string) config('services.fylings.base_url'), '/');

        try {
            $response = Http::timeout(30)
                ->withToken((string) config('services.fylings.api_key'))
                ->get($baseUrl.'/v1/companies', [
                    'q' => $query,
                    'limit' => $ctx->limit,
                ]);

            ApiUsage::query()->create([
                'organization_id' => $ctx->organizationId,
                'provider' => 'fylings',
                'endpoint' => 'companies',
                'units' => 1,
                'estimated_cost' => 0.01,
                'meta' => ['status' => $response->status()],
            ]);

            if (! $response->successful()) {
                return collect();
            }

            $items = $response->json('data') ?? $response->json('results') ?? [];

            return collect($items)->map(function ($item) {
                $row = is_array($item) ? $item : [];

                return new RawDiscoveryHit(
                    name: (string) ($row['name'] ?? 'Unknown'),
                    source: 'registry',
                    provider: 'fylings',
                    location: $row['country'] ?? $row['location'] ?? null,
                    sector: $row['industry'] ?? null,
                    website: $row['website'] ?? null,
                    externalId: isset($row['id']) ? (string) $row['id'] : null,
                    meta: $row,
                );
            })->values();
        } catch (\Throwable $e) {
            Log::warning('Fylings search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
