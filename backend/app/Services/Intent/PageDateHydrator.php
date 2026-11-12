<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\RawSocialHit;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Recovers the publish date of undated posts by reading the page itself: article meta
 * tags, JSON-LD datePublished, or a <time datetime>. Posts without a date are dropped by
 * the grounding gate, so a date recovered here is a post that can still be qualified.
 */
class PageDateHydrator
{
    private const TIMEOUT_SECONDS = 5;

    private const MAX_BYTES = 600_000;

    /**
     * @param  array<int, RawSocialHit>  $hits  keyed by caller index
     * @return array<int, RawSocialHit> the same keys, with postedAt filled where found
     */
    public function hydrateMany(array $hits): array
    {
        $urls = [];
        foreach ($hits as $key => $hit) {
            if ($hit->postedAt === null && filled($hit->postUrl) && preg_match('#^https?://#i', (string) $hit->postUrl)) {
                $urls[$key] = (string) $hit->postUrl;
            }
        }
        if ($urls === []) {
            return $hits;
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($urls): array {
                $requests = [];
                foreach ($urls as $key => $url) {
                    $requests[] = $pool->as((string) $key)
                        ->timeout(self::TIMEOUT_SECONDS)
                        ->connectTimeout(self::TIMEOUT_SECONDS)
                        ->withUserAgent('Mozilla/5.0 (compatible; SalesEngineBot/1.0)')
                        ->accept('text/html,application/xhtml+xml')
                        ->get($url);
                }

                return $requests;
            });
        } catch (\Throwable) {
            return $hits;
        }

        foreach ($urls as $key => $url) {
            $response = $responses[(string) $key] ?? null;
            if (! $response instanceof Response || ! $response->successful()) {
                continue;
            }
            $date = $this->dateFromHtml(substr($response->body(), 0, self::MAX_BYTES));
            if ($date === null) {
                continue;
            }
            $hit = $hits[$key];
            $hits[$key] = new RawSocialHit(
                platform: $hit->platform,
                sourceLabel: $hit->sourceLabel,
                sourceIcon: $hit->sourceIcon,
                postText: $hit->postText,
                postUrl: $hit->postUrl,
                snippet: $hit->snippet,
                title: $hit->title,
                authorName: $hit->authorName,
                authorProfileUrl: $hit->authorProfileUrl,
                postedAt: $date,
                dateRaw: $hit->dateRaw ?? 'page:'.$date->toIso8601String(),
                fullText: $hit->fullText,
            );
        }

        return $hits;
    }

    public function dateFromHtml(string $html): ?CarbonInterface
    {
        $candidates = [];
        foreach ([
            '/<meta[^>]+(?:property|name|itemprop)=["\'](?:article:published_time|og:published_time|datePublished|publish-date|pubdate|date)["\'][^>]+content=["\']([^"\']+)["\']/i',
            '/<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\'](?:article:published_time|og:published_time|datePublished)["\']/i',
            '/"datePublished"\s*:\s*"([^"]+)"/i',
            '/"uploadDate"\s*:\s*"([^"]+)"/i',
            '/<time[^>]+datetime=["\']([^"\']+)["\']/i',
        ] as $pattern) {
            if (preg_match($pattern, $html, $m)) {
                $candidates[] = $m[1];
            }
        }

        foreach ($candidates as $raw) {
            try {
                $date = Carbon::parse(trim($raw));
            } catch (\Throwable) {
                continue;
            }
            if ($date->greaterThan(now()->addDay()) || $date->lessThan(now()->subYears(5))) {
                continue;
            }

            return $date;
        }

        return null;
    }
}
