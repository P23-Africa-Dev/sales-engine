<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IcpSearchBriefAlignmentTest extends TestCase
{
    public function test_generic_generate_uses_icp_search_brief_and_ignores_chat_theme(): void
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
            'name' => 'Niche ICP',
            'description' => 'Profile description fallback',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing'],
                'territories' => ['england'],
                'customPrompt' => 'specialty component suppliers for industrial OEMs',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Niche',
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'Tell me about shipping logistics to emerging markets',
            'intent' => 'quick_research',
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Logistics and emerging markets overview…',
            'intent' => 'quick_research',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Precision Parts Ltd — Industrial OEM supplier',
                        'link' => 'https://example.com/precision-parts',
                        'snippet' => 'Specialty component suppliers for industrial OEMs in England.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();

        $userMessage = ChatMessage::query()->find($response->json('data.user_message.id'));
        $this->assertNotNull($userMessage);
        $this->assertSame('give me prospects', $userMessage->body);

        $meta = is_array($userMessage->meta) ? $userMessage->meta : [];
        $this->assertTrue((bool) ($meta['icp_search_brief'] ?? false));
        $this->assertSame(
            'specialty component suppliers for industrial OEMs',
            $meta['effective_query'] ?? null
        );
        $this->assertStringNotContainsString('shipping', mb_strtolower((string) ($meta['effective_query'] ?? '')));
        $this->assertStringNotContainsString('logistics', mb_strtolower((string) ($meta['effective_query'] ?? '')));

        $run = DiscoveryRun::query()
            ->where('chat_session_id', $session->id)
            ->orderByDesc('id')
            ->first();
        $this->assertNotNull($run);
        $this->assertSame('specialty component suppliers for industrial OEMs', $run->query);
    }

    public function test_generate_more_reseeds_from_current_icp_brief(): void
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

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Niche ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS'],
                'customPrompt' => 'billing automation platforms',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'title' => 'More',
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'give me prospects',
            'intent' => 'generate_leads',
            'meta' => [
                'icp_search_brief' => true,
                'effective_query' => 'billing automation platforms',
                'original_query' => 'give me prospects',
                'brief_user_query' => 'give me prospects',
            ],
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Found 1 lead.',
            'intent' => 'generate_leads',
            'leads' => [['name' => 'Prior Co']],
        ]);

        $icp->update([
            'config' => array_merge($icp->config ?? [], [
                'customPrompt' => 'invoice reconciliation SaaS for mid-market',
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'LedgerSoft — Invoice reconciliation',
                        'link' => 'https://example.com/ledgersoft',
                        'snippet' => 'Invoice reconciliation SaaS for mid-market finance teams.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'generate more prospects',
                'intent' => 'generate_more_leads',
            ]);

        $response->assertOk();

        $userMessage = ChatMessage::query()->find($response->json('data.user_message.id'));
        $meta = is_array($userMessage?->meta) ? $userMessage->meta : [];
        $this->assertTrue((bool) ($meta['icp_search_brief'] ?? false));
        $this->assertSame(
            'invoice reconciliation SaaS for mid-market',
            $meta['effective_query'] ?? null
        );
    }
}
