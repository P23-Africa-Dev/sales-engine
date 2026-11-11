<?php

namespace App\Services\Discovery\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DiscoveryProviderHealth;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Serper Places (Google Maps listings) for company discovery. Each listing is a real,
 * located business with its own website and main phone line — strong territory evidence
 * and a contact number before any enrichment runs. Company searches only.
 */
class SerperPlacesDiscoveryAdapter implements DiscoverySourceInterface
{
    public const PROVIDER = 'serper_places';

    /** Territories queried per call; the orchestrator already splits multi-country plans by region. */
    private const MAX_TERRITORIES = 2;

    public function __construct(private readonly ?DiscoveryProviderHealth $health = null) {}

    public function key(): string
    {
        return self::PROVIDER;
    }

    public function isEnabled(): bool
    {
        return trim((string) config('services.serper.api_key')) !== ''
            && (bool) config('services.serper.places_enabled', true);
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        if (! $this->isEnabled() || $brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
            return collect();
        }

        $theme = $this->theme($brief);
        if ($theme === '') {
            return collect();
        }

        $territories = array_slice(array_values(array_filter(
            array_map(static fn ($t): string => is_string($t) ? trim($t) : '', $brief->territories),
        )), 0, self::MAX_TERRITORIES);
        $queries = $territories === []
            ? [$theme]
            : array_map(static fn (string $territory): string => $theme.' in '.$territory, $territories);

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $responses = Http::pool(function ($pool) use ($queries, $baseUrl) {
            foreach ($queries as $index => $query) {
                $pool->as((string) $index)
                    ->timeout(20)
                    ->withHeaders([
                        'X-API-KEY' => (string) config('services.serper.api_key'),
                        'Content-Type' => 'application/json',
                    ])
                    ->post($baseUrl.'/places', ['q' => $query]);
            }
        });

        $hits = collect();
        foreach ($queries as $index => $query) {
            $response = $responses[(string) $index] ?? null;
            if (! $response instanceof Response) {
                continue;
            }

            $this->logUsage($ctx, $query, $response->status());
            if (! $response->successful()) {
                $this->health?->recordFailure(self::PROVIDER, $response->status(), $response->body());
                Log::info('Serper places search failed', ['status' => $response->status()]);

                continue;
            }

            foreach ($response->json('places') ?? [] as $place) {
                $hit = $this->mapPlace(is_array($place) ? $place : []);
                if ($hit !== null) {
                    $hits->push($hit);
                }
            }
        }

        return $hits->unique(fn (RawDiscoveryHit $hit): string => mb_strtolower($hit->name))->values();
    }

    /**
     * @param  array<string, mixed>  $place
     */
    public function mapPlace(array $place): ?RawDiscoveryHit
    {
        $name = trim((string) ($place['title'] ?? ''));
        if ($name === '') {
            return null;
        }

        $website = trim((string) ($place['website'] ?? ''));
        $address = trim((string) ($place['address'] ?? ''));
        $category = trim((string) ($place['category'] ?? ''));
        $phone = trim((string) ($place['phoneNumber'] ?? $place['phone'] ?? ''));
        $rating = $place['rating'] ?? null;

        $snippet = implode(' · ', array_filter([
            $category,
            $address,
            is_numeric($rating) ? $rating.'★ ('.(int) ($place['ratingCount'] ?? 0).' reviews)' : null,
        ]));

        return new RawDiscoveryHit(
            name: $name,
            source: 'web',
            provider: self::PROVIDER,
            website: $website !== '' ? $website : null,
            location: $address !== '' ? $address : null,
            sector: $category !== '' ? $category : null,
            snippet: $snippet !== '' ? $snippet : null,
            url: $website !== '' ? $website : null,
            externalId: isset($place['cid']) ? (string) $place['cid'] : null,
            meta: array_filter([
                'phone' => $phone,
                'address' => $address,
                'category' => $category,
                'rating' => $rating,
            ], static fn ($v): bool => $v !== null && $v !== ''),
        );
    }

    private function theme(IcpBrief $brief): string
    {
        $theme = $brief->cleanedUserQuery();
        if ($theme === '') {
            $theme = $brief->industries !== [] ? (string) $brief->industries[0] : $brief->interestSearchSeed();
        }
        // Maps search wants a short business-type phrase, not a sentence.
        $theme = preg_replace('/\b(in|across|within|based in)\s+[\p{L}\s,]+$/u', '', $theme) ?? $theme;
        $words = preg_split('/\s+/u', trim($theme)) ?: [];

        return trim(implode(' ', array_slice($words, 0, 6)));
    }

    private function logUsage(SearchContext $ctx, string $query, int $status): void
    {
        try {
            ApiUsage::query()->create([
                'organization_id' => $ctx->organizationId,
                'provider' => 'serper',
                'endpoint' => 'places',
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => ['status' => $status, 'query' => $query],
            ]);
        } catch (\Throwable) {
            // Usage logging must never fail a discovery run.
        }
    }
}
