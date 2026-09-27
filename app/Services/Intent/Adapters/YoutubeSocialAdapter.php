<?php

namespace App\Services\Intent\Adapters;

use App\Models\ApiUsage;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialSourceHealth;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * YouTube Data API search. Stays dormant until YOUTUBE_API_KEY is set,
 * then joins the next scan without a code change.
 */
class YoutubeSocialAdapter implements SocialSourceInterface
{
    public function key(): string
    {
        return 'youtube';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.youtube.api_key')) !== '';
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
        string $tbs = 'qdr:w',
        array $context = [],
    ): Collection {
        $apiKey = trim((string) config('services.youtube.api_key'));
        if ($apiKey === '') {
            return collect();
        }

        $publishedAfter = match ($tbs) {
            'qdr:d', 'qdr:h' => now()->subDay(),
            'qdr:w' => now()->subDays(7),
            default => now()->subDays(30),
        };

        try {
            $response = Http::timeout(30)->get('https://www.googleapis.com/youtube/v3/search', [
                'part' => 'snippet',
                'type' => 'video',
                'order' => 'date',
                'q' => mb_substr($query, 0, 180),
                'maxResults' => min(8, max(1, $limit)),
                'publishedAfter' => $publishedAfter->toIso8601String(),
                'key' => $apiKey,
            ]);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'youtube',
                'endpoint' => 'search',
                'units' => 1,
                'estimated_cost' => 0,
                'meta' => ['status' => $response->status()],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), 0);

                return collect();
            }

            $items = $response->json('items') ?? [];
            $hits = collect(is_array($items) ? $items : [])->map(function (array $item) {
                $snippet = $item['snippet'] ?? [];
                $videoId = (string) ($item['id']['videoId'] ?? '');
                $title = (string) ($snippet['title'] ?? '');
                $description = (string) ($snippet['description'] ?? '');
                $published = (string) ($snippet['publishedAt'] ?? '');
                $postedAt = null;
                if ($published !== '') {
                    try {
                        $postedAt = Carbon::parse($published);
                    } catch (\Throwable) {
                        $postedAt = null;
                    }
                }

                $channel = trim((string) ($snippet['channelTitle'] ?? ''));
                $channelId = trim((string) ($snippet['channelId'] ?? ''));

                return new RawSocialHit(
                    platform: 'youtube',
                    sourceLabel: 'YouTube',
                    sourceIcon: 'yt',
                    postText: trim($description !== '' ? $description : $title),
                    postUrl: $videoId !== '' ? 'https://www.youtube.com/watch?v='.$videoId : null,
                    snippet: $description !== '' ? mb_substr($description, 0, 400) : null,
                    title: $title !== '' ? $title : null,
                    authorName: $channel !== '' ? $channel : null,
                    authorProfileUrl: $channelId !== '' ? 'https://www.youtube.com/channel/'.$channelId : null,
                    postedAt: $postedAt,
                    dateRaw: $published !== '' ? $published : null,
                );
            })->filter(fn (RawSocialHit $hit) => $hit->postText !== '' && $hit->postUrl !== null)->values();

            app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), $hits->count());

            return $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt($this->key(), 0, 0);
            Log::warning('YouTube social search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
