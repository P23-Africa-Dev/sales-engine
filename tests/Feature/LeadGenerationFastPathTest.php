<?php

namespace Tests\Feature;

use App\Jobs\ProcessChatIntentJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class LeadGenerationFastPathTest extends TestCase
{
    public function test_ideal_prospect_prompt_normalizes_and_completes_with_first_batch(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.youtube.api_key' => '',
            'services.x.bearer_token' => '',
            'services.meta.access_token' => '',
            'queue.default' => 'sync',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tommy Test',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail', 'textile'],
                'territories' => ['Lagos, NG', 'Nigeria'],
                'decisionMakers' => ['Head of Sales', 'CEO'],
                'minMatchScore' => 1,
                'enrichContactDetails' => true,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Tommy Test',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Ada Okonkwo — Head of Sales at Loom Africa',
                        'link' => 'https://www.linkedin.com/in/ada-okonkwo',
                        'snippet' => 'Head of Sales leading retail expansion across Lagos.',
                    ],
                    [
                        'title' => 'Chidi Nwosu — CEO, Textile Partners NG',
                        'link' => 'https://www.linkedin.com/in/chidi-nwosu',
                        'snippet' => 'CEO of textile distribution company in Nigeria.',
                    ],
                    [
                        'title' => 'How to scale a fashion brand in Africa',
                        'link' => 'https://example.com/blog/scale-fashion',
                        'snippet' => 'Tips and checklist for brand growth.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'kind generate ideal prospect for my brand',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();
        $this->assertSame('completed', $response->json('data.status'));
        $assistant = $response->json('data.assistant_message');
        $this->assertNotEmpty($assistant['leads'] ?? []);
        $this->assertLessThanOrEqual(QueryIntentService::DEFAULT_LEAD_LIMIT, count($assistant['leads']));

        $userMessage = ChatMessage::query()->find($response->json('data.user_message.id'));
        $this->assertTrue((bool) ($userMessage->meta['query_normalized'] ?? false));
        $this->assertStringNotContainsString('kind generate ideal', mb_strtolower((string) ($userMessage->meta['effective_query'] ?? '')));
    }

    public function test_generate_more_excludes_prior_lead_names(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.youtube.api_key' => '',
            'services.x.bearer_token' => '',
            'services.meta.access_token' => '',
            'queue.default' => 'sync',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tommy Test',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['textile'],
                'territories' => ['Nigeria'],
                'decisionMakers' => ['CEO'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Tommy Test',
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Found 1 prospect.',
            'intent' => 'generate_leads',
            'leads' => [
                ['id' => 1, 'name' => 'Ada Okonkwo', 'title' => 'CEO'],
            ],
            'meta' => [],
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Ada Okonkwo — CEO at Loom Africa',
                        'link' => 'https://www.linkedin.com/in/ada-okonkwo',
                        'snippet' => 'CEO leading retail expansion.',
                    ],
                    [
                        'title' => 'Bola Adebayo — CEO, Fabric Hub',
                        'link' => 'https://www.linkedin.com/in/bola-adebayo',
                        'snippet' => 'CEO of fabric distribution in Lagos.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Generate more prospects for the same ICP',
                'intent' => 'generate_more_leads',
            ]);

        $response->assertOk();
        $leads = $response->json('data.assistant_message.leads') ?? [];
        $names = array_map(fn($lead) => mb_strtolower((string) ($lead['name'] ?? '')), $leads);
        $this->assertNotContains('ada okonkwo', $names);
        $this->assertTrue(collect($names)->contains(fn($n) => str_contains($n, 'bola')));
    }

    public function test_async_chat_job_uses_discovery_queue(): void
    {
        config(['queue.default' => 'redis']);
        Queue::fake();

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Chat',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'generate leads',
                'intent' => 'generate_leads',
            ])
            ->assertStatus(202);

        Queue::assertPushedOn('discovery', ProcessChatIntentJob::class);
    }

    public function test_orchestrator_soft_deadline_constants_are_under_job_timeout(): void
    {
        $this->assertSame(50, DiscoveryOrchestrator::FIRST_BATCH_SOFT_SECONDS);
        $this->assertSame(150, DiscoveryOrchestrator::HARD_DEADLINE_SECONDS);
        $this->assertLessThan((new ProcessChatIntentJob(1, 1))->timeout, DiscoveryOrchestrator::HARD_DEADLINE_SECONDS);
    }
}
