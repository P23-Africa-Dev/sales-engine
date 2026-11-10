<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\RawSocialHit;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Best-effort read of a public Reddit post. A blocked request leaves the
 * original snippet in place.
 */
class RedditPostHydrator
{
    public function hydrate(RawSocialHit $hit): RawSocialHit
    {
        $url = trim((string) $hit->postUrl);
        if ($url === '' || ! preg_match('#^https?://(?:www\.|old\.)?reddit\.com/#i', $url)) {
            return $hit;
        }

        $jsonUrl = rtrim((string) (preg_replace('/\?.*$/', '', $url) ?? $url), '/').'.json';

        try {
            $response = Http::connectTimeout(3)
                ->timeout(5)
                ->withHeaders([
                    'User-Agent' => (string) config('services.reddit.user_agent', 'sales-engine/1.0'),
                    'Accept' => 'application/json',
                ])
                ->get($jsonUrl);
        } catch (\Throwable) {
            return $hit;
        }

        if (! $response->successful()) {
            return $hit;
        }

        $data = $response->json('0.data.children.0.data');
        if (! is_array($data)) {
            return $hit;
        }

        $title = trim((string) ($data['title'] ?? $hit->title ?? ''));
        $self = trim((string) ($data['selftext'] ?? ''));
        $body = trim($self !== '' ? trim($title."\n".$self) : '');
        if ($body === '') {
            return $hit;
        }

        $created = $data['created_utc'] ?? null;
        $postedAt = is_numeric($created) ? Carbon::createFromTimestampUTC((int) $created) : $hit->postedAt;
        $author = trim((string) ($data['author'] ?? ''));

        return new RawSocialHit(
            platform: $hit->platform,
            sourceLabel: $hit->sourceLabel,
            sourceIcon: $hit->sourceIcon,
            postText: $body,
            postUrl: $hit->postUrl,
            snippet: $hit->snippet,
            title: $title !== '' ? $title : $hit->title,
            authorName: $author !== '' ? 'u/'.$author : $hit->authorName,
            authorProfileUrl: $author !== '' ? 'https://www.reddit.com/user/'.$author : $hit->authorProfileUrl,
            postedAt: $postedAt ?? $hit->postedAt,
            dateRaw: $postedAt?->toIso8601String() ?? $hit->dateRaw,
            fullText: true,
        );
    }
}
