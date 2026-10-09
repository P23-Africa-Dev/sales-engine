<?php

namespace Tests\Unit\Intent;

use App\Models\ApiUsage;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\Adapters\MetaGraphPagesAdapter;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MetaGraphPagesAdapterTest extends TestCase
{
    private function brief(): IcpBrief
    {
        return new IcpBrief(
            name: 'Test',
            description: '',
            industries: ['SaaS'],
            territories: ['NG'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );
    }

    public function test_is_enabled_requires_token_and_source_key(): void
    {
        $adapter = new MetaGraphPagesAdapter;

        config(['services.meta.access_token' => '']);
        $this->assertFalse($adapter->isEnabled($this->brief(), ['meta_graph_pages']));

        config(['services.meta.access_token' => 'token-abc']);
        $this->assertFalse($adapter->isEnabled($this->brief(), ['meta_pages']));
        $this->assertTrue($adapter->isEnabled($this->brief(), ['meta_graph_pages']));
    }

    public function test_empty_meta_page_ids_returns_empty_collection(): void
    {
        config(['services.meta.access_token' => 'token-abc']);
        Http::fake();

        $adapter = new MetaGraphPagesAdapter;
        $hits = $adapter->search($this->brief(), 'ignored query', 1, 8, 'qdr:w', [
            'meta_page_ids' => [],
        ]);

        $this->assertTrue($hits->isEmpty());
        Http::assertNothingSent();
    }

    public function test_maps_posts_with_created_time_and_engagement_hint(): void
    {
        config(['services.meta.access_token' => 'token-abc']);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'data' => [
                    [
                        'id' => '123_456',
                        'message' => 'We just launched a new logistics partnership across West Africa.',
                        'created_time' => '2026-09-08T10:00:00+0000',
                        'permalink_url' => 'https://www.facebook.com/123/posts/456',
                        'from' => ['name' => 'Acme Logistics', 'id' => '123'],
                        'likes' => ['summary' => ['total_count' => 124]],
                        'comments' => ['summary' => ['total_count' => 12]],
                        'shares' => ['count' => 3],
                    ],
                ],
            ], 200),
        ]);

        $adapter = new MetaGraphPagesAdapter;
        $hits = $adapter->search($this->brief(), 'ignored', $org->id, 8, 'qdr:w', [
            'meta_page_ids' => ['acme-logistics'],
        ]);

        $this->assertCount(1, $hits);
        $hit = $hits->first();
        $this->assertSame('meta', $hit->platform);
        $this->assertSame('Meta Page Post', $hit->sourceLabel);
        $this->assertStringContainsString('logistics partnership', $hit->postText);
        $this->assertNotNull($hit->postedAt);
        $this->assertSame('2026-09-08', $hit->postedAt->toDateString());
        $this->assertStringContainsString('124 likes', (string) $hit->snippet);
        $this->assertStringContainsString('12 comments', (string) $hit->snippet);
        $this->assertSame('Acme Logistics', $hit->authorName);

        $this->assertSame(1, ApiUsage::query()
            ->where('organization_id', $org->id)
            ->where('provider', 'meta_graph')
            ->where('endpoint', 'page_posts')
            ->count());
    }

    public function test_memoizes_page_fetches_across_search_calls(): void
    {
        config(['services.meta.access_token' => 'token-abc']);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'data' => [
                    [
                        'id' => '1_1',
                        'message' => 'Hello world',
                        'created_time' => '2026-09-08T10:00:00+0000',
                        'permalink_url' => 'https://www.facebook.com/1/posts/1',
                    ],
                ],
            ], 200),
        ]);

        $adapter = new MetaGraphPagesAdapter;
        $context = ['meta_page_ids' => ['page-one']];

        $adapter->search($this->brief(), 'q1', $org->id, 8, 'qdr:w', $context);
        $adapter->search($this->brief(), 'q2', $org->id, 8, 'qdr:w', $context);

        Http::assertSentCount(1);
        $this->assertSame(1, ApiUsage::query()
            ->where('organization_id', $org->id)
            ->where('provider', 'meta_graph')
            ->count());
    }

    public function test_gracefully_handles_permission_error_without_throwing(): void
    {
        config(['services.meta.access_token' => 'token-abc']);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => [
                    'message' => '(#100) Object does not exist, cannot be loaded due to missing permission',
                    'type' => 'OAuthException',
                    'code' => 100,
                ],
            ], 400),
        ]);

        $adapter = new MetaGraphPagesAdapter;
        $hits = $adapter->search($this->brief(), 'ignored', $org->id, 8, 'qdr:w', [
            'meta_page_ids' => ['restricted-page'],
        ]);

        $this->assertTrue($hits->isEmpty());
        $this->assertSame(1, ApiUsage::query()
            ->where('organization_id', $org->id)
            ->where('provider', 'meta_graph')
            ->count());
    }

    public function test_gracefully_handles_expired_token_error(): void
    {
        config(['services.meta.access_token' => 'token-abc']);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => [
                    'message' => 'Error validating access token: Session has expired',
                    'type' => 'OAuthException',
                    'code' => 190,
                ],
            ], 401),
        ]);

        $adapter = new MetaGraphPagesAdapter;
        $hits = $adapter->search($this->brief(), 'ignored', $org->id, 8, 'qdr:w', [
            'meta_page_ids' => ['any-page'],
        ]);

        $this->assertTrue($hits->isEmpty());
    }
}
