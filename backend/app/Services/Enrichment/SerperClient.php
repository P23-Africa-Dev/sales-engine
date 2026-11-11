<?php

namespace App\Services\Enrichment;

use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin Serper (google.serper.dev) client for enrichment lookups, mirroring
 * SerperDiscoveryAdapter::postSearch auth. Responses are cached per query.
 */
class SerperClient
{
    private const CACHE_DAYS = 7;

    public function isConfigured(): bool
    {
        return trim((string) config('services.serper.api_key')) !== ''
            && $this->baseUrl() !== '';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function search(array $payload, string $endpoint = 'search'): array
    {
        return $this->searchMany([$payload], $endpoint)[0] ?? [];
    }

    /**
     * Runs several queries concurrently; result order matches input order.
     *
     * @param  list<array<string, mixed>>  $payloads
     * @return list<array<string, mixed>>
     */
    public function searchMany(array $payloads, string $endpoint = 'search'): array
    {
        if (! $this->isConfigured() || $payloads === []) {
            return array_fill(0, count($payloads), []);
        }

        $results = [];
        $pending = [];
        foreach ($payloads as $index => $payload) {
            $cached = Cache::get($this->cacheKey($endpoint, $payload));
            if (is_array($cached)) {
                $results[$index] = $cached;
            } else {
                $pending[$index] = $payload;
            }
        }

        if ($pending !== []) {
            $url = $this->baseUrl().'/'.$endpoint;
            $headers = [
                'X-API-KEY' => (string) config('services.serper.api_key'),
                'Content-Type' => 'application/json',
            ];

            try {
                $responses = Http::pool(function (Pool $pool) use ($pending, $url, $headers): array {
                    $requests = [];
                    foreach ($pending as $index => $payload) {
                        $requests[] = $pool->as((string) $index)->timeout(20)->withHeaders($headers)->post($url, $payload);
                    }

                    return $requests;
                });
            } catch (\Throwable $e) {
                Log::debug('Serper enrichment pool failed', ['error' => $e->getMessage()]);
                $responses = [];
            }

            foreach ($pending as $index => $payload) {
                $response = $responses[(string) $index] ?? null;
                if ($response instanceof Response && $response->successful()) {
                    $json = $response->json();
                    $results[$index] = is_array($json) ? $json : [];
                    Cache::put($this->cacheKey($endpoint, $payload), $results[$index], now()->addDays(self::CACHE_DAYS));
                } else {
                    $results[$index] = [];
                }
            }
        }

        ksort($results);

        return array_values($results);
    }

    /**
     * Flattens organic + knowledge-graph rows into title/snippet/url triples.
     *
     * @param  array<string, mixed>  $response
     * @return list<array{title: string, snippet: string, url: string}>
     */
    public function organicRows(array $response): array
    {
        $rows = [];

        $graph = $response['knowledgeGraph'] ?? null;
        if (is_array($graph)) {
            $attributes = is_array($graph['attributes'] ?? null) ? $graph['attributes'] : [];
            $parts = [(string) ($graph['description'] ?? '')];
            foreach ($attributes as $key => $value) {
                $parts[] = $key.': '.(is_scalar($value) ? (string) $value : '');
            }
            if (isset($graph['phoneNumber'])) {
                $parts[] = 'Phone: '.$graph['phoneNumber'];
            }
            $rows[] = [
                'title' => (string) ($graph['title'] ?? ''),
                'snippet' => trim(implode(' · ', array_filter($parts))),
                'url' => (string) ($graph['website'] ?? ''),
            ];
        }

        foreach ((array) ($response['organic'] ?? []) as $row) {
            if (! is_array($row)) {
                continue;
            }
            $rows[] = [
                'title' => (string) ($row['title'] ?? ''),
                'snippet' => (string) ($row['snippet'] ?? ''),
                'url' => (string) ($row['link'] ?? ''),
            ];
        }

        return $rows;
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('services.serper.base_url', 'https://google.serper.dev'), '/');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function cacheKey(string $endpoint, array $payload): string
    {
        return 'enrichment:serper:v1:'.$endpoint.':'.md5((string) json_encode($payload));
    }
}
