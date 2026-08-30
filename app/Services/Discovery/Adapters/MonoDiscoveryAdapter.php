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

class MonoDiscoveryAdapter implements DiscoverySourceInterface
{
    public function key(): string
    {
        return 'mono';
    }

    public function isEnabled(): bool
    {
        return trim((string) config('services.mono.secret_key')) !== '';
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled()) {
            return collect();
        }

        $query = $brief->searchQuery();
        $baseUrl = rtrim((string) config('services.mono.base_url'), '/');

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'mono-sec-key' => (string) config('services.mono.secret_key'),
                    'Accept' => 'application/json',
                ])
                ->get($baseUrl.'/v1/companies/search', [
                    'search' => $query,
                ]);

            ApiUsage::query()->create([
                'organization_id' => $ctx->organizationId,
                'provider' => 'mono',
                'endpoint' => 'companies/search',
                'units' => 1,
                'estimated_cost' => 0.01,
                'meta' => ['status' => $response->status()],
            ]);

            if (! $response->successful()) {
                return collect();
            }

            $items = $response->json('data') ?? $response->json() ?? [];
            if (! is_array($items)) {
                return collect();
            }

            return collect($items)->take($ctx->limit)->map(function ($item) {
                $row = is_array($item) ? $item : [];

                return new RawDiscoveryHit(
                    name: (string) ($row['name'] ?? $row['company_name'] ?? 'Unknown'),
                    source: 'registry',
                    provider: 'mono',
                    location: $row['address'] ?? $row['state'] ?? 'Nigeria',
                    sector: $row['industry'] ?? null,
                    snippet: $row['registration_number'] ?? null,
                    externalId: isset($row['id']) ? (string) $row['id'] : null,
                    meta: $row,
                );
            })->values();
        } catch (\Throwable $e) {
            Log::warning('Mono search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
