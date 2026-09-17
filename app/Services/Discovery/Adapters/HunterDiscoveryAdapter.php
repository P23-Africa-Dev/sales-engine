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

/**
 * Hunter Discover — free company search (does not burn email finder credits).
 */
class HunterDiscoveryAdapter implements DiscoverySourceInterface
{
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

            return collect($items)
                ->take(max(1, $ctx->limit))
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
                            : ($brief->territories[0] ?? null),
                        sector: isset($row['industry']) ? (string) $row['industry'] : ($brief->industries[0] ?? null),
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

        $locations = $this->inferHeadquartersLocations($query, $brief);
        if ($locations !== []) {
            $payload['headquarters_location'] = [
                'include' => $locations,
            ];
        }

        return $payload;
    }

    /**
     * @return list<array<string, string>>
     */
    private function inferHeadquartersLocations(string $query, IcpBrief $brief): array
    {
        $haystack = mb_strtolower($query.' '.implode(' ', $brief->territories));
        $locations = [];

        $cityCountry = [
            'lagos' => ['city' => 'Lagos', 'country' => 'NG'],
            'abuja' => ['city' => 'Abuja', 'country' => 'NG'],
            'nairobi' => ['city' => 'Nairobi', 'country' => 'KE'],
            'accra' => ['city' => 'Accra', 'country' => 'GH'],
            'johannesburg' => ['city' => 'Johannesburg', 'country' => 'ZA'],
            'cape town' => ['city' => 'Cape Town', 'country' => 'ZA'],
        ];

        foreach ($cityCountry as $needle => $loc) {
            if (str_contains($haystack, $needle)) {
                $locations[] = $loc;
            }
        }

        if ($locations === [] && (str_contains($haystack, 'nigeria') || str_contains($haystack, ' ng'))) {
            $locations[] = ['country' => 'NG'];
        }

        return $locations;
    }
}
