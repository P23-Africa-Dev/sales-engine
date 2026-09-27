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

class MetaGraphPagesAdapter implements SocialSourceInterface
{
    private const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

    /** @var array<string, Collection<int, RawSocialHit>> */
    private array $pageCache = [];

    public function key(): string
    {
        return 'meta_graph_pages';
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.meta.access_token')) !== '';
    }

    public function activatesWhenConfigured(): bool
    {
        return false;
    }

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool
    {
        return in_array($this->key(), $enabledSources, true)
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
        $pageIds = $this->normalizePageIds($context['meta_page_ids'] ?? []);
        if ($pageIds === []) {
            return collect();
        }

        $token = trim((string) config('services.meta.access_token'));
        if ($token === '') {
            return collect();
        }

        $hits = collect();
        foreach ($pageIds as $pageId) {
            $hits = $hits->merge($this->fetchPagePosts($pageId, $token, $organizationId, $limit));
        }

        return $hits->take($limit * max(1, count($pageIds)))->values();
    }

    /**
     * @param  list<mixed>  $raw
     * @return list<string>
     */
    private function normalizePageIds(array $raw): array
    {
        $ids = [];
        foreach ($raw as $item) {
            $id = trim((string) $item);
            $id = ltrim($id, '@');
            if ($id !== '') {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * @return Collection<int, RawSocialHit>
     */
    private function fetchPagePosts(string $pageId, string $token, int $organizationId, int $limit): Collection
    {
        if (isset($this->pageCache[$pageId])) {
            return $this->pageCache[$pageId];
        }

        try {
            $response = Http::timeout(30)
                ->get(self::GRAPH_BASE . '/' . rawurlencode($pageId) . '/posts', [
                    'fields' => 'id,message,story,created_time,permalink_url,from{name,id},likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
                    'limit' => min(10, max(1, $limit)),
                    'access_token' => $token,
                ]);

            ApiUsage::query()->create([
                'organization_id' => $organizationId,
                'provider' => 'meta_graph',
                'endpoint' => 'page_posts',
                'units' => 1,
                'estimated_cost' => 0,
                'meta' => [
                    'status' => $response->status(),
                    'page_id' => $pageId,
                ],
            ]);

            if (! $response->successful()) {
                app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), 0);
                $error = $response->json('error') ?? [];
                Log::warning('Meta Graph page posts failed', [
                    'page_id' => $pageId,
                    'status' => $response->status(),
                    'error_code' => $error['code'] ?? null,
                    'error_message' => $error['message'] ?? $response->body(),
                ]);

                return $this->pageCache[$pageId] = collect();
            }

            $data = $response->json('data') ?? [];
            if (! is_array($data)) {
                return $this->pageCache[$pageId] = collect();
            }

            $hits = collect($data)
                ->map(fn(array $post) => $this->mapPost($post, $pageId))
                ->filter(fn(?RawSocialHit $h) => $h !== null && $h->postText !== '')
                ->values();

            app(SocialSourceHealth::class)->recordAttempt($this->key(), $response->status(), $hits->count());

            return $this->pageCache[$pageId] = $hits;
        } catch (\Throwable $e) {
            app(SocialSourceHealth::class)->recordAttempt($this->key(), 0, 0);
            Log::warning('Meta Graph page posts exception', [
                'page_id' => $pageId,
                'error' => $e->getMessage(),
            ]);

            return $this->pageCache[$pageId] = collect();
        }
    }

    /**
     * @param  array<string, mixed>  $post
     */
    private function mapPost(array $post, string $pageId): ?RawSocialHit
    {
        $message = trim((string) ($post['message'] ?? ''));
        $story = trim((string) ($post['story'] ?? ''));
        $postText = $message !== '' ? $message : $story;
        if ($postText === '') {
            return null;
        }

        $authorName = isset($post['from']['name']) ? (string) $post['from']['name'] : null;
        $authorProfileUrl = null;
        if (isset($post['from']['id']) && trim((string) $post['from']['id']) !== '') {
            $authorProfileUrl = 'https://www.facebook.com/'.trim((string) $post['from']['id']);
        } elseif (isset($post['from']['link']) && trim((string) $post['from']['link']) !== '') {
            $authorProfileUrl = trim((string) $post['from']['link']);
        }
        $permalink = isset($post['permalink_url']) ? (string) $post['permalink_url'] : null;
        if ($permalink === null && isset($post['id'])) {
            $permalink = 'https://www.facebook.com/' . (string) $post['id'];
        }

        $createdRaw = isset($post['created_time']) ? (string) $post['created_time'] : null;
        $postedAt = null;
        if ($createdRaw !== null && $createdRaw !== '') {
            try {
                $postedAt = Carbon::parse($createdRaw);
            } catch (\Throwable) {
                $postedAt = null;
            }
        }

        $likes = (int) ($post['likes']['summary']['total_count'] ?? 0);
        $comments = (int) ($post['comments']['summary']['total_count'] ?? 0);
        $shares = (int) ($post['shares']['count'] ?? 0);
        $engagementParts = [];
        if ($likes > 0) {
            $engagementParts[] = "{$likes} likes";
        }
        if ($comments > 0) {
            $engagementParts[] = "{$comments} comments";
        }
        if ($shares > 0) {
            $engagementParts[] = "{$shares} shares";
        }
        $engagementHint = $engagementParts !== []
            ? ' (' . implode(' · ', $engagementParts) . ')'
            : '';

        $snippet = mb_substr($postText, 0, 400) . $engagementHint;
        $title = $authorName
            ? "{$authorName} on Meta"
            : "Meta Page {$pageId}";

        return new RawSocialHit(
            platform: 'meta',
            sourceLabel: 'Meta Page Post',
            sourceIcon: 'f',
            postText: $postText,
            postUrl: $permalink,
            snippet: $snippet,
            title: $title,
            authorName: $authorName,
            authorProfileUrl: $authorProfileUrl,
            postedAt: $postedAt,
            dateRaw: $createdRaw,
        );
    }
}
