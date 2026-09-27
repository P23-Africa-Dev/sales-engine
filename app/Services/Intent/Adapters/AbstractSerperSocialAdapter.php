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

abstract class AbstractSerperSocialAdapter implements SocialSourceInterface
{
    abstract protected function sourceKey(): string;

    abstract protected function platform(): string;

    abstract protected function sourceLabel(): string;

    abstract protected function sourceIcon(): string;

    /** @return list<string> */
    abstract protected function siteFilters(): array;

    public function __construct(
        private readonly SocialPostDateParser $dateParser = new SocialPostDateParser,
    ) {}

    public function key(): string
    {
        return $this->sourceKey();
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.serper.api_key')) !== '';
    }

    public function activatesWhenConfigured(): bool
    {
        return false;
    }

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool
    {
        return in_array($this->sourceKey(), $enabledSources, true)
            && $this->isConfigured();
    }

    public function search(
        IcpBrief $brief,
        string $query,
        int $organizationId,
        int $limit = 8,
        string $tbs = 'qdr:w',
        array $context = [],
    ): Collection {
        $siteClause = implode(' OR ', array_map(fn(string $s) => "site:{$s}", $this->siteFilters()));
        $fullQuery = trim("({$siteClause}) {$query}");

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $tbs = trim($tbs) !== '' ? $tbs : 'qdr:w';

        try {
            $payload = [
                'q' => $fullQuery,
                'num' => min(10, $limit),
                'tbs' => $tbs,
            ];

            $response = Http::timeout(30)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl . '/search', $payload);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'serper',
                'endpoint' => 'social_' . $this->sourceKey(),
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => [
                    'status' => $response->status(),
                    'query' => $fullQuery,
                    'tbs' => $tbs,
                ],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->sourceKey(), $response->status(), 0);
                Log::warning('Serper social search failed', [
                    'source' => $this->sourceKey(),
                    'status' => $response->status(),
                ]);

                return collect();
            }

            $organic = $response->json('organic') ?? [];

            $hits = collect($organic)->map(function (array $item) {
                $title = (string) ($item['title'] ?? '');
                $snippet = (string) ($item['snippet'] ?? '');
                $link = isset($item['link']) ? (string) $item['link'] : null;
                $dateRaw = isset($item['date']) ? (string) $item['date'] : null;
                $postText = trim($snippet !== '' ? $snippet : $title);
                $postedAt = $this->dateParser->parse($dateRaw, $snippet ?: null, null, $link);
                $author = $this->extractAuthor($link, $title, $snippet);

                return new RawSocialHit(
                    platform: $this->platform(),
                    sourceLabel: $this->sourceLabel(),
                    sourceIcon: $this->sourceIcon(),
                    postText: $postText,
                    postUrl: $link,
                    snippet: $snippet ?: null,
                    title: $title ?: null,
                    authorName: $author['name'],
                    authorProfileUrl: $author['profile_url'],
                    postedAt: $postedAt,
                    dateRaw: $dateRaw,
                );
            })->filter(fn(RawSocialHit $h) => $h->postText !== '')->values();

            app(SocialSourceHealth::class)->recordAttempt($this->sourceKey(), $response->status(), $hits->count());

            return $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt($this->sourceKey(), 0, 0);
            Log::warning('Serper social search exception', [
                'source' => $this->sourceKey(),
                'error' => $e->getMessage(),
            ]);

            return collect();
        }
    }

    /**
     * Best-effort author name + profile URL from platform post URLs / titles.
     *
     * @return array{name: ?string, profile_url: ?string}
     */
    protected function extractAuthor(?string $link, string $title, string $snippet): array
    {
        $link = trim((string) $link);
        $platform = $this->platform();

        if ($platform === 'linkedin') {
            return $this->extractLinkedInAuthor($link, $title);
        }

        if ($platform === 'x') {
            return $this->extractXAuthor($link, $title);
        }

        if ($platform === 'reddit') {
            return $this->extractRedditAuthor($link, $title, $snippet);
        }

        if ($platform === 'meta') {
            return $this->extractMetaAuthor($link, $title);
        }

        return ['name' => null, 'profile_url' => null];
    }

    /**
     * @return array{name: ?string, profile_url: ?string}
     */
    private function extractLinkedInAuthor(string $link, string $title): array
    {
        if ($link !== '' && preg_match('~linkedin\.com/in/([^/?#]+)~i', $link, $m)) {
            $slug = urldecode($m[1]);
            $name = $this->humanizeSlug($slug);

            return [
                'name' => $name,
                'profile_url' => 'https://www.linkedin.com/in/' . $slug,
            ];
        }

        // Posts: linkedin.com/posts/{slug}_activity-...
        if ($link !== '' && preg_match('~linkedin\.com/posts/([^/?#_]+)~i', $link, $m)) {
            $slug = urldecode($m[1]);
            $name = $this->humanizeSlug($slug);

            return [
                'name' => $name !== '' ? $name : null,
                'profile_url' => 'https://www.linkedin.com/in/' . $slug,
            ];
        }

        // Title often starts with "Jane Doe on LinkedIn: ..."
        if (preg_match('/^(.+?)\s+on\s+LinkedIn\b/iu', $title, $m)) {
            $name = trim($m[1]);

            return ['name' => $name !== '' ? $name : null, 'profile_url' => null];
        }

        return ['name' => null, 'profile_url' => null];
    }

    /**
     * @return array{name: ?string, profile_url: ?string}
     */
    private function extractXAuthor(string $link, string $title): array
    {
        if ($link !== '' && preg_match('#(?:twitter\.com|x\.com)/(@?[\w]+)/(?:status|statuses)/#i', $link, $m)) {
            $handle = ltrim($m[1], '@');
            if (! in_array(mb_strtolower($handle), ['i', 'home', 'search', 'explore', 'intent'], true)) {
                return [
                    'name' => '@' . $handle,
                    'profile_url' => 'https://x.com/' . $handle,
                ];
            }
        }

        if (preg_match('/@([\w]{2,})/u', $title, $m)) {
            $handle = $m[1];

            return [
                'name' => '@' . $handle,
                'profile_url' => 'https://x.com/' . $handle,
            ];
        }

        return ['name' => null, 'profile_url' => null];
    }

    /**
     * @return array{name: ?string, profile_url: ?string}
     */
    private function extractRedditAuthor(string $link, string $title, string $snippet): array
    {
        $haystack = $title . ' ' . $snippet . ' ' . $link;
        if (preg_match('#(?:reddit\.com/user/|reddit\.com/u/|\\bu/)([\w-]+)#i', $haystack, $m)) {
            $username = $m[1];

            return [
                'name' => 'u/' . $username,
                'profile_url' => 'https://www.reddit.com/user/' . $username,
            ];
        }

        return ['name' => null, 'profile_url' => null];
    }

    /**
     * @return array{name: ?string, profile_url: ?string}
     */
    private function extractMetaAuthor(string $link, string $title): array
    {
        if ($link !== '' && preg_match('#facebook\.com/(?:profile\.php\?id=(\d+)|([\w.\-]+))#i', $link, $m)) {
            if (! empty($m[1])) {
                return [
                    'name' => null,
                    'profile_url' => 'https://www.facebook.com/' . $m[1],
                ];
            }
            $slug = $m[2] ?? '';
            if ($slug !== '' && ! in_array(mb_strtolower($slug), ['posts', 'watch', 'groups', 'events', 'share'], true)) {
                return [
                    'name' => $this->humanizeSlug($slug),
                    'profile_url' => 'https://www.facebook.com/' . $slug,
                ];
            }
        }

        if (preg_match('/^(.+?)\s+on\s+Meta\b/iu', $title, $m)) {
            return ['name' => trim($m[1]) ?: null, 'profile_url' => null];
        }

        return ['name' => null, 'profile_url' => null];
    }

    private function humanizeSlug(string $slug): string
    {
        $slug = str_replace(['-', '_', '+'], ' ', $slug);
        $slug = preg_replace('/\s+/u', ' ', $slug) ?? $slug;

        return trim(ucwords(mb_strtolower($slug)));
    }
}
