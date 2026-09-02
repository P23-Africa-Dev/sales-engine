<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Jobs\ProcessChatIntentJob;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ChatIntentTest extends TestCase
{
    public function test_quick_research_returns_research_meta_without_leads(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Research',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'West Africa FMCG Trends',
                        'link' => 'https://example.com/trends',
                        'snippet' => 'Market growth in FMCG sector.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => Http::sequence()
                ->push([
                    'choices' => [[
                        'message' => [
                            'content' => '{"sub_queries":["FMCG trends West Africa","competitor landscape"]}',
                        ],
                    ]],
                ], 200)
                ->push([
                    'choices' => [[
                        'message' => [
                            'content' => "## Executive Summary\nKey FMCG trends in West Africa.",
                        ],
                    ]],
                ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Research FMCG market trends in West Africa',
                'intent' => 'quick_research',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.intent', 'quick_research')
            ->assertJsonPath('data.assistant_message.meta.research.sub_queries.0', 'FMCG trends West Africa');

        $this->assertNull($response->json('data.assistant_message.leads'));
        $this->assertDatabaseMissing('leads', [
            'organization_id' => $org->id,
            'name' => 'West Africa FMCG Trends',
        ]);
    }

    public function test_generate_leads_returns_leads_with_crm_fields(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Acme Distributors Lagos',
                        'link' => 'https://acme.example.com',
                        'snippet' => 'Leading FMCG distributor.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Top FMCG distributors in Lagos',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.intent', 'generate_leads')
            ->assertJsonPath('data.assistant_message.leads.0.name', 'Acme Distributors Lagos')
            ->assertJsonPath('data.assistant_message.leads.0.crm_synced', false)
            ->assertJsonPath('data.assistant_message.leads.0.save_status', 'draft');

        $this->assertDatabaseHas('leads', [
            'organization_id' => $org->id,
            'name' => 'Acme Distributors Lagos',
            'save_status' => 'draft',
        ]);
    }

    public function test_lead_sync_to_crm_endpoint(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
            'services.factory23.crm_sync_enabled' => true,
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42, 'factory23_crm_sync_enabled' => true]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'CRM Co',
            'stage' => 'new',
            'save_status' => 'draft',
            'score' => 88,
        ]);

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['lead' => ['id' => 777]]], 201),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/leads/{$lead->id}/sync-to-crm")
            ->assertOk()
            ->assertJsonPath('data.synced', true)
            ->assertJsonPath('data.f23_lead_id', '777')
            ->assertJsonPath('data.save_status', 'saved');

        $this->assertDatabaseHas('leads', [
            'id' => $lead->id,
            'save_status' => 'saved',
        ]);
    }

    public function test_current_session_is_scoped_to_icp(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $icpA = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP A',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $icpB = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP B',
            'is_active' => false,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $sessionA = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icpA->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $sessionA->id,
            'role' => 'user',
            'body' => 'Hello A',
        ]);

        $sessionB = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icpB->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $sessionB->id,
            'role' => 'user',
            'body' => 'Hello B',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/chat/sessions/current?icp_profile_id={$icpA->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $sessionA->id);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/chat/sessions/current?icp_profile_id={$icpB->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $sessionB->id);
    }

    public function test_clear_session_messages(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'To be cleared',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->deleteJson("/api/v1/chat/sessions/{$session->id}/messages")
            ->assertOk()
            ->assertJsonPath('data.cleared', true);

        $this->assertDatabaseMissing('chat_messages', ['chat_session_id' => $session->id]);
    }

    public function test_async_chat_intent_dispatches_job_when_queue_is_not_sync(): void
    {
        config(['queue.default' => 'redis']);

        Queue::fake();

        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
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
                'body' => 'Top FMCG distributors in Lagos',
                'intent' => 'generate_leads',
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'processing');

        Queue::assertPushed(ProcessChatIntentJob::class);
    }

    public function test_freeform_create_leads_message_upgrades_to_generate_leads(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Acme Distributors Lagos',
                        'link' => 'https://acme.example.com',
                        'snippet' => 'Leading FMCG distributor.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'create leads for the top 10 wealthiest men',
                'intent' => 'freeform',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.intent', 'generate_leads')
            ->assertJsonPath('data.assistant_message.leads.0.name', 'Acme Distributors Lagos')
            ->assertJsonPath('data.assistant_message.leads.0.save_status', 'draft');

        $this->assertDatabaseHas('chat_messages', [
            'chat_session_id' => $session->id,
            'role' => 'user',
            'intent' => 'generate_leads',
        ]);
    }
}
