<?php

namespace App\Services\Intent\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\RawSocialHit;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

abstract class AbstractSerperSocialAdapter implements SocialSourceInterface
{
    abstract protected function sourceKey(): string;

    abstract protected function platform(): string;

    abstract protected function sourceLabel(): string;

    abstract protected function sourceIcon(): string;

    /** @return list<string> */
    abstract protected function siteFilters(): array;

    public function key(): string
    {
        return $this->sourceKey();
    }

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool
    {
        return in_array($this->sourceKey(), $enabledSources, true)
            && trim((string) config('services.serper.api_key')) !== '';
    }

    public function search(IcpBrief $brief, string $query, int $organizationId, int $limit = 8): Collection
    {
        $siteClause = implode(' OR ', array_map(fn(string $s) => "site:{$s}", $this->siteFilters()));
        $fullQuery = trim("({$siteClause}) {$query}");

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl . '/search', [
                    'q' => $fullQuery,
                    'num' => min(10, $limit),
                ]);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'serper',
                'endpoint' => 'social_' . $this->sourceKey(),
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => ['status' => $response->status(), 'query' => $fullQuery],
            ]);

            if (! $response->successful()) {
                Log::warning('Serper social search failed', [
                    'source' => $this->sourceKey(),
                    'status' => $response->status(),
                ]);

                return collect();
            }

            $organic = $response->json('organic') ?? [];

            return collect($organic)->map(function (array $item) {
                $title = (string) ($item['title'] ?? '');
                $snippet = (string) ($item['snippet'] ?? '');
                $link = isset($item['link']) ? (string) $item['link'] : null;
                $postText = trim($snippet !== '' ? $snippet : $title);

                return new RawSocialHit(
                    platform: $this->platform(),
                    sourceLabel: $this->sourceLabel(),
                    sourceIcon: $this->sourceIcon(),
                    postText: $postText,
                    postUrl: $link,
                    snippet: $snippet ?: null,
                    title: $title ?: null,
                );
            })->filter(fn(RawSocialHit $h) => $h->postText !== '')->values();
        } catch (\Throwable $e) {
            Log::warning('Serper social search exception', [
                'source' => $this->sourceKey(),
                'error' => $e->getMessage(),
            ]);

            return collect();
        }
    }
}
