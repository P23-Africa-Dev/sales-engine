<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\RawSocialHit;
use Carbon\Carbon;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Best-effort read of a public Reddit post. A blocked request leaves the
 * original snippet in place.
 *
 * Search snippets are a sentence or two and usually lack a date, which made
 * the grounding gate drop most Reddit hits. The post JSON carries the full
 * body and the exact creation time, so hydrating is what turns a Reddit
 * search hit into something the qualifier can judge.
 */
class RedditPostHydrator
{
    public function hydrate(RawSocialHit $hit): RawSocialHit
    {
        $jsonUrl = $this->jsonUrl($hit);
        if ($jsonUrl === null) {
            return $hit;
        }

        try {
            $response = $this->request(Http::getFacadeRoot())->get($jsonUrl);
        } catch (\Throwable) {
            return $hit;
        }

        return $this->apply($hit, $response);
    }

    /**
     * Hydrate several posts concurrently. Keys are preserved.
     *
     * @param  array<int|string, RawSocialHit>  $hits
     * @return array<int|string, RawSocialHit>
     */
    public function hydrateMany(array $hits): array
    {
        $urls = [];
        foreach ($hits as $key => $hit) {
            $url = $this->jsonUrl($hit);
            if ($url !== null) {
                $urls[(string) $key] = $url;
            }
        }

        if ($urls === []) {
            return $hits;
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($urls) {
                foreach ($urls as $key => $url) {
                    $this->request($pool->as($key))->get($url);
                }
            });
        } catch (\Throwable) {
            return $hits;
        }

        $out = $hits;
        foreach ($hits as $key => $hit) {
            $response = $responses[(string) $key] ?? null;
            if ($response instanceof Response) {
                $out[$key] = $this->apply($hit, $response);
            }
        }

        return $out;
    }

    private function jsonUrl(RawSocialHit $hit): ?string
    {
        $url = trim((string) $hit->postUrl);
        if ($url === '' || ! preg_match('#^https?://(?:www\.|old\.)?reddit\.com/r/[^/]+/comments/#i', $url)) {
            return null;
        }

        return rtrim((string) (preg_replace('/\?.*$/', '', $url) ?? $url), '/').'.json';
    }

    /**
     * @param  mixed  $client  The Http factory or a pool slot.
     */
    private function request(mixed $client): mixed
    {
        return $client
            ->connectTimeout(3)
            ->timeout(6)
            ->withHeaders([
                'User-Agent' => (string) config('services.reddit.user_agent', 'sales-engine/1.0'),
                'Accept' => 'application/json',
            ]);
    }

    private function apply(RawSocialHit $hit, Response $response): RawSocialHit
    {
        if (! $response->successful()) {
            return $hit;
        }

        $data = $response->json('0.data.children.0.data');
        if (! is_array($data)) {
            return $hit;
        }

        $title = trim((string) ($data['title'] ?? $hit->title ?? ''));
        $self = trim((string) ($data['selftext'] ?? ''));
        if (in_array($self, ['[removed]', '[deleted]'], true)) {
            $self = '';
        }
        $body = $self !== '' ? trim($title."\n".$self) : '';

        $created = $data['created_utc'] ?? null;
        $postedAt = is_numeric($created) ? Carbon::createFromTimestampUTC((int) $created) : $hit->postedAt;
        $author = trim((string) ($data['author'] ?? ''));
        if ($author === '[deleted]') {
            $author = '';
        }

        if ($body === '' && $postedAt === $hit->postedAt) {
            return $hit;
        }

        return new RawSocialHit(
            platform: $hit->platform,
            sourceLabel: $hit->sourceLabel,
            sourceIcon: $hit->sourceIcon,
            postText: $body !== '' ? $body : $hit->postText,
            postUrl: $hit->postUrl,
            snippet: $hit->snippet,
            title: $title !== '' ? $title : $hit->title,
            authorName: $author !== '' ? 'u/'.$author : $hit->authorName,
            authorProfileUrl: $author !== '' ? 'https://www.reddit.com/user/'.$author : $hit->authorProfileUrl,
            postedAt: $postedAt ?? $hit->postedAt,
            dateRaw: $postedAt?->toIso8601String() ?? $hit->dateRaw,
            fullText: $body !== '' ? true : $hit->fullText,
        );
    }
}
