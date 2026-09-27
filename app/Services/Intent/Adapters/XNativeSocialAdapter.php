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
 * Native X recent search. Serper X keeps working when this bearer is
 * rejected (typical of a free plan that cannot search).
 */
class XNativeSocialAdapter implements SocialSourceInterface
{
    public function key(): string
    {
        return 'x_native';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.x.bearer_token')) !== '';
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
        $token = trim((string) config('services.x.bearer_token'));
        if ($token === '') {
            return collect();
        }

        $q = trim(preg_replace('/\s+/u', ' ', $query) ?? $query);
        $q = mb_substr($q, 0, 480);
        if (! str_contains(mb_strtolower($q), 'is:retweet')) {
            $q .= ' -is:retweet';
        }

        try {
            $response = Http::timeout(30)
                ->withToken($token)
                ->get('https://api.twitter.com/2/tweets/search/recent', [
                    'query' => $q,
                    'max_results' => max(10, min(20, $limit)),
                    'tweet.fields' => 'created_at,author_id',
                ]);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'x',
                'endpoint' => 'search_recent',
                'units' => 1,
                'estimated_cost' => 0,
                'meta' => ['status' => $response->status()],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), 0);

                return collect();
            }

            $tweets = $response->json('data') ?? [];
            $hits = collect(is_array($tweets) ? $tweets : [])->map(function (array $tweet) {
                $id = (string) ($tweet['id'] ?? '');
                $text = trim((string) ($tweet['text'] ?? ''));
                $created = (string) ($tweet['created_at'] ?? '');
                $postedAt = null;
                if ($created !== '') {
                    try {
                        $postedAt = Carbon::parse($created);
                    } catch (\Throwable) {
                        $postedAt = null;
                    }
                }
                $authorId = trim((string) ($tweet['author_id'] ?? ''));

                return new RawSocialHit(
                    platform: 'x',
                    sourceLabel: 'X Post',
                    sourceIcon: 'x',
                    postText: $text,
                    postUrl: $id !== '' ? 'https://x.com/i/status/'.$id : null,
                    snippet: $text !== '' ? mb_substr($text, 0, 280) : null,
                    title: $text !== '' ? mb_substr($text, 0, 80) : null,
                    authorName: $authorId !== '' ? $authorId : null,
                    authorProfileUrl: null,
                    postedAt: $postedAt,
                    dateRaw: $created !== '' ? $created : null,
                );
            })->filter(fn (RawSocialHit $hit) => $hit->postText !== '' && $hit->postUrl !== null)->values();

            app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), $hits->count());

            return $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt($this->key(), 0, 0);
            Log::warning('X native social search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
