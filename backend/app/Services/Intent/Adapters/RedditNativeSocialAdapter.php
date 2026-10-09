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
 * Native Reddit search. Stays off until both client id and secret are set.
 * Serper Reddit remains the working Reddit source until then.
 */
class RedditNativeSocialAdapter implements SocialSourceInterface
{
    public function key(): string
    {
        return 'reddit_native';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.reddit.client_id')) !== ''
            && trim((string) config('services.reddit.client_secret')) !== '';
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
        if (! $this->isConfigured()) {
            return collect();
        }

        $userAgent = (string) config('services.reddit.user_agent', 'sales-engine/1.0');

        try {
            $tokenResponse = Http::timeout(20)
                ->withBasicAuth(
                    (string) config('services.reddit.client_id'),
                    (string) config('services.reddit.client_secret'),
                )
                ->withHeaders(['User-Agent' => $userAgent])
                ->asForm()
                ->post('https://www.reddit.com/api/v1/access_token', [
                    'grant_type' => 'client_credentials',
                ]);

            if (! $tokenResponse->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), $tokenResponse->status(), 0);

                return collect();
            }

            $access = trim((string) $tokenResponse->json('access_token'));
            if ($access === '') {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), 401, 0);

                return collect();
            }

            $window = match ($tbs) {
                'qdr:d', 'qdr:h' => 'day',
                'qdr:y' => 'year',
                default => 'month',
            };

            $response = Http::timeout(30)
                ->withToken($access)
                ->withHeaders(['User-Agent' => $userAgent])
                ->get('https://oauth.reddit.com/search', [
                    'q' => mb_substr($query, 0, 200),
                    'sort' => 'new',
                    't' => $window,
                    'limit' => min(10, max(1, $limit)),
                    'type' => 'link',
                ]);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'reddit',
                'endpoint' => 'search',
                'units' => 1,
                'estimated_cost' => 0,
                'meta' => ['status' => $response->status()],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), 0);

                return collect();
            }

            $children = $response->json('data.children') ?? [];
            $hits = collect(is_array($children) ? $children : [])->map(function (array $child) {
                $data = $child['data'] ?? [];
                if (! is_array($data)) {
                    return null;
                }
                $title = trim((string) ($data['title'] ?? ''));
                $self = trim((string) ($data['selftext'] ?? ''));
                $permalink = trim((string) ($data['permalink'] ?? ''));
                $created = $data['created_utc'] ?? null;
                $postedAt = is_numeric($created) ? Carbon::createFromTimestampUTC((int) $created) : null;
                $author = trim((string) ($data['author'] ?? ''));

                return new RawSocialHit(
                    platform: 'reddit',
                    sourceLabel: 'Reddit Post',
                    sourceIcon: 'r',
                    postText: trim($self !== '' ? $self : $title),
                    postUrl: $permalink !== '' ? 'https://www.reddit.com'.$permalink : null,
                    snippet: $title !== '' ? mb_substr($title, 0, 300) : null,
                    title: $title !== '' ? $title : null,
                    authorName: $author !== '' ? 'u/'.$author : null,
                    authorProfileUrl: $author !== '' ? 'https://www.reddit.com/user/'.$author : null,
                    postedAt: $postedAt,
                    dateRaw: $postedAt?->toIso8601String(),
                );
            })->filter(fn (?RawSocialHit $hit) => $hit !== null && $hit->postText !== '' && $hit->postUrl !== null)->values();

            app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), $hits->count());

            return $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt($this->key(), 0, 0);
            Log::warning('Reddit native social search exception', ['error' => $e->getMessage()]);

            return collect();
        }
    }
}
