<?php

namespace Tests\Feature;

use App\Jobs\ProcessQuickResearchJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Services\Research\ResearchOrchestrator;
use Illuminate\Queue\TimeoutExceededException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ResearchOrchestratorFastPathTest extends TestCase
{
    public function test_quick_research_dispatches_dedicated_research_job(): void
    {
        config(['queue.default' => 'redis']);
        Queue::fake();

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'What is happening in African fintech payments?',
                'intent' => 'quick_research',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'processing');

        Queue::assertPushedOn('research', ProcessQuickResearchJob::class);
        $jobTimeout = (new ProcessQuickResearchJob(1, 1))->timeout;
        $this->assertSame(90, $jobTimeout);
        $this->assertGreaterThan(ResearchOrchestrator::HARD_DEADLINE_SECONDS, $jobTimeout);
    }

    public function test_parallel_serper_fetch_and_single_synthesis_call(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'queue.default' => 'sync',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech & Payments'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Research',
        ]);

        $glmCalls = 0;
        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Lagos Fintech Funding Report',
                        'link' => 'https://example.com/lagos-fintech',
                        'snippet' => 'Series B activity rose across payments.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => function ($request) use (&$glmCalls) {
                $glmCalls++;
                $body = $request->body();
                if (str_contains($body, 'Decompose a B2B research question')) {
                    return Http::response([
                        'choices' => [[
                            'message' => [
                                'content' => '{"sub_queries":["Lagos fintech funding","payments competitors Africa"]}',
                            ],
                        ]],
                    ], 200);
                }

                return Http::response([
                    'choices' => [[
                        'message' => [
                            'content' => json_encode([
                                'narrative' => "## Executive Summary\nPayments momentum in Lagos [1].",
                                'reasons' => [
                                    ['index' => 1, 'icp_relevance_reason' => 'Matches FinTech focus in Lagos.'],
                                ],
                            ]),
                        ],
                    ]],
                ], 200);
            },
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Research African fintech payments trends for enterprise sellers',
                'intent' => 'quick_research',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.intent', 'quick_research')
            ->assertJsonPath(
                'data.assistant_message.meta.research.sources.0.icp_relevance_reason',
                'Matches FinTech focus in Lagos.'
            );

        // Decompose + merged synthesize only (no separate tagging call, no contextualize for self-contained prompt).
        $this->assertSame(2, $glmCalls);

        $serperCalls = collect(Http::recorded())
            ->filter(fn($pair) => str_contains((string) $pair[0]->url(), 'google.serper.dev'))
            ->count();
        // Parallel searchMany should issue one pooled request per sub-query (2), not N*sources sequential.
        $this->assertSame(2, $serperCalls);
    }

    public function test_job_timeout_recovers_persisted_research_sources(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
        ]);

        $sources = [[
            'title' => 'Payments infra brief',
            'url' => 'https://example.com/payments',
            'snippet' => 'Open banking rails expanding.',
            'provider' => 'serper',
        ]];

        $run = DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'running',
            'query' => 'open banking Africa',
            'intent' => 'quick_research',
            'stages' => ['synthesizing'],
            'started_at' => now()->subMinute(),
            'result_summary' => [
                'sources' => $sources,
                'sub_queries' => ['open banking Africa'],
                'source_count' => 1,
            ],
        ]);

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'open banking Africa',
            'intent' => 'quick_research',
            'meta' => ['intent' => 'quick_research'],
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Researching…',
            'intent' => 'quick_research',
            'meta' => [
                'pending' => true,
                'discovery_run_id' => $run->id,
            ],
        ]);

        $job = new ProcessQuickResearchJob($run->id, $userMessage->id);
        $job->failed(new TimeoutExceededException('ProcessQuickResearchJob has timed out.'));

        $run->refresh();
        $this->assertSame('completed', $run->status);
        $this->assertNull($run->error);

        $assistant = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($assistant);
        $this->assertFalse((bool) ($assistant->meta['pending'] ?? true));
        $this->assertStringContainsString('Payments infra brief', $assistant->body);
        $this->assertSame('Payments infra brief', $assistant->meta['research']['sources'][0]['title'] ?? null);
    }
}
