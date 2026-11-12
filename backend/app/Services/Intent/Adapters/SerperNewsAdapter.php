<?php

namespace App\Services\Intent\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialPostDateParser;
use App\Services\Intent\SocialSourceHealth;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * News and press releases (Serper news search). Company events such as market entries,
 * distributor appointments and leadership hires are published here, not in social posts.
 * Only event-signal queries are routed to this source (see SocialListeningOrchestrator).
 */
class SerperNewsAdapter implements SocialSourceInterface
{
    public const KEY = 'news';

    public function __construct(
        private readonly SocialPostDateParser $dateParser = new SocialPostDateParser,
    ) {}

    public function key(): string
    {
        return self::KEY;
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.serper.api_key')) !== '';
    }

    public function activatesWhenConfigured(): bool
    {
        return true;
    }

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool
    {
        return $this->isConfigured();
    }

    public function search(
        IcpBrief $brief,
        string $query,
        int $organizationId,
        int $limit = 8,
        string $tbs = 'qdr:m',
        array $context = [],
    ): Collection {
        $tbs = trim($tbs) !== '' ? $tbs : 'qdr:m';

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post(rtrim((string) config('services.serper.base_url'), '/').'/news', array_filter([
                    'q' => $query,
                    'num' => min(10, $limit),
                    'tbs' => $tbs,
                    // Home-market press for a localized query (e.g. gl=de, hl=de).
                    'gl' => isset($context['gl']) ? (string) $context['gl'] : null,
                    'hl' => isset($context['hl']) ? (string) $context['hl'] : null,
                ], static fn ($value): bool => $value !== null && $value !== ''));

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'serper',
                'endpoint' => 'social_'.self::KEY,
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => ['status' => $response->status(), 'query' => $query, 'tbs' => $tbs],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt(self::KEY, $response->status(), 0);
                Log::warning('Serper news search failed', ['status' => $response->status()]);

                return collect();
            }

            $hits = collect($response->json('news') ?? [])
                ->filter(fn ($item): bool => is_array($item))
                ->map(function (array $item): RawSocialHit {
                    $title = trim((string) ($item['title'] ?? ''));
                    $snippet = trim((string) ($item['snippet'] ?? ''));
                    $link = isset($item['link']) ? (string) $item['link'] : null;
                    $dateRaw = isset($item['date']) ? (string) $item['date'] : null;
                    $publisher = trim((string) ($item['source'] ?? '')) ?: null;

                    return new RawSocialHit(
                        platform: 'news',
                        sourceLabel: $publisher !== null ? 'News · '.$publisher : 'News',
                        sourceIcon: 'news',
                        // The headline carries the event ("X appoints Y as distributor in Kenya").
                        postText: trim($title.($snippet !== '' ? '. '.$snippet : '')),
                        postUrl: $link,
                        snippet: $snippet !== '' ? $snippet : null,
                        title: $title !== '' ? $title : null,
                        authorName: $publisher,
                        authorProfileUrl: null,
                        postedAt: $this->dateParser->parse($dateRaw, $snippet ?: null, null, $link),
                        dateRaw: $dateRaw,
                    );
                })
                ->filter(fn (RawSocialHit $hit): bool => $hit->postText !== '')
                ->values();

            app(SocialSourceHealth::class)->recordAttempt(self::KEY, $response->status(), $hits->count());

            return $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt(self::KEY, 0, 0);
            Log::warning('Serper news search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
