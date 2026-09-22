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

    public function test_further_my_need_prompt_uses_icp_brief_and_both_target(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
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
            'name' => 'UK',
            'description' => 'manufacturing equipment companies HVAC',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing', 'Construction & Real Estate'],
                'territories' => ['england'],
                'decisionMakers' => ['Head of Sales', 'Managing Director / CEO'],
                'customPrompt' => 'companies in construction, earthmoving, and heavy equipment expanding to emerging markets',
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'UK',
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Based on your active ICP: Opportunity in Emerging Markets…',
            'intent' => 'freeform',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Plant Hire Ltd | Company',
                        'link' => 'https://www.linkedin.com/company/plant-hire-ltd',
                        'snippet' => 'Earthmoving and construction equipment hire in England.',
                    ],
                    [
                        'title' => 'Jane Smith - Managing Director at Plant Hire Ltd',
                        'link' => 'https://www.linkedin.com/in/jane-smith-plant',
                        'snippet' => 'Managing Director. Construction equipment.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'effective_query' => 'Generate me 10 prospects that fit my Manufacturing, Construction, and Real Estate focus in England, aligned with roles such as Head of Sales, Managing Director, or CEO.',
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Generate me 10 prospect that can further my need',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();

        $userMessage = ChatMessage::query()->find($response->json('data.user_message.id'));
        $meta = is_array($userMessage?->meta) ? $userMessage->meta : [];
        $this->assertTrue((bool) ($meta['icp_search_brief'] ?? false));
        $this->assertStringContainsString('construction', mb_strtolower((string) ($meta['effective_query'] ?? '')));
        $this->assertStringContainsString('earthmoving', mb_strtolower((string) ($meta['effective_query'] ?? '')));
        $this->assertStringNotContainsString('aligned with roles', mb_strtolower((string) ($meta['effective_query'] ?? '')));
        $this->assertStringNotContainsString('manufacturing, construction, and real estate focus', mb_strtolower((string) ($meta['effective_query'] ?? '')));

        $run = DiscoveryRun::query()
            ->where('chat_session_id', $session->id)
            ->orderByDesc('id')
            ->first();
        $this->assertNotNull($run);
        $stages = is_array($run->stages) ? $run->stages : [];
        $this->assertContains('people_pass', $stages);
        $this->assertContains('company_pass', $stages);
    }

    public function test_companies_only_mode_cue_keeps_icp_brief(): void
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
            'name' => 'UK',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing'],
                'customPrompt' => 'companies in construction, earthmoving, and heavy equipment expanding to emerging markets',
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'UK',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Plant Hire Ltd | Company',
                        'link' => 'https://www.linkedin.com/company/plant-hire-ltd',
                        'snippet' => 'Earthmoving equipment hire.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();
        $meta = ChatMessage::query()->find($response->json('data.user_message.id'))?->meta ?? [];
        $this->assertTrue((bool) ($meta['icp_search_brief'] ?? false));
        $this->assertStringContainsString('earthmoving', mb_strtolower((string) ($meta['effective_query'] ?? '')));

        $run = DiscoveryRun::query()->where('chat_session_id', $session->id)->orderByDesc('id')->first();
        $this->assertNotNull($run);
        $stages = is_array($run->stages) ? $run->stages : [];
        $this->assertNotContains('people_pass', $stages);
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

    public function test_generic_generate_geo_scopes_serper_and_drops_india_linkedin(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'decisionMakers' => ['UniqueDecisionMakerTitle'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'NG',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Pune Freight Hub',
                        'link' => 'https://www.linkedin.com/company/pune-freight-hub',
                        'snippet' => 'Logistics and 3PL operator in India.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();
        $this->assertEmpty($response->json('data.assistant_message.leads') ?? []);

        Http::assertSent(function ($request) {
            $data = $request->data();
            $q = mb_strtolower((string) ($data['q'] ?? ''));

            $geoScoped = ($data['gl'] ?? null) === 'ng'
                || str_contains((string) ($data['location'] ?? ''), 'Nigeria')
                || str_contains($q, 'nigeria');

            return $geoScoped && ! str_contains($q, 'uniquedecisionmakertitle');
        });
    }

    public function test_generic_generate_keeps_lagos_logistics_hit(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'NG keep',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Lagos 3PL Partners',
                        'link' => 'https://lagos3pl.example.com',
                        'snippet' => 'Contract logistics and 3PL warehousing in Lagos, Nigeria.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.leads.0.name', 'Lagos 3PL Partners');
    }

    public function test_user_query_naming_india_may_persist_india_hit(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'India override',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Pune Freight Hub',
                        'link' => 'https://punefreight.example.com',
                        'snippet' => 'Logistics and 3PL operator in India.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'companies in India (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.leads.0.name', 'Pune Freight Hub');
    }

    public function test_authoritative_people_query_does_not_require_nigeria_in_q(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Wealth',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Top 10 Wealthiest Men in the World',
                        'link' => 'https://www.forbes.com/billionaires',
                        'snippet' => '1. Bernard Arnault 2. Elon Musk 3. Jeff Bezos',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'top 10 wealthiest men',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();

        Http::assertSent(function ($request) {
            $data = $request->data();
            $q = mb_strtolower((string) ($data['q'] ?? ''));

            return str_contains($q, 'forbes')
                && ! str_contains($q, 'nigeria')
                && ($data['gl'] ?? null) !== 'ng';
        });
    }

    public function test_linkedin_company_without_place_is_kept_advisory(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Unknown geo keep',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Cedarline Warehousing',
                        'link' => 'https://www.linkedin.com/company/cedarline-warehousing',
                        'snippet' => 'Contract logistics and 3PL warehousing for retailers.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();
        $leads = $response->json('data.assistant_message.leads') ?? [];
        $this->assertNotEmpty($leads);
        $this->assertSame('Cedarline Warehousing', $leads[0]['name'] ?? null);
        $this->assertFalse((bool) ($leads[0]['icp_recommended'] ?? true));
        $this->assertSame('unknown', $leads[0]['location_status'] ?? null);
    }

    public function test_hunter_ng_hit_is_not_starved_behind_serper_junk(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => 'test-hunter',
            'services.bytemine.api_key' => '',
            'services.youtube.api_key' => '',
            'services.x.bearer_token' => '',
            'services.meta.access_token' => '',
            'queue.default' => 'sync',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Hunter NG',
        ]);

        $junk = [];
        for ($i = 1; $i <= 12; $i++) {
            $junk[] = [
                'title' => "Top {$i} logistics strategies for 2024",
                'link' => "https://blog.example.com/logistics-guide-{$i}",
                'snippet' => 'A blog checklist of logistics tips and playbooks.',
            ];
        }

        Http::fake([
            'google.serper.dev/*' => Http::response(['organic' => $junk], 200),
            'api.hunter.io/*' => Http::response([
                'data' => [
                    [
                        'organization' => 'Kobo Logistics',
                        'domain' => 'kobo360.com.ng',
                        'country' => 'NG',
                        'industry' => 'Logistics',
                        'description' => 'Freight and 3PL across Nigeria.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk();
        $names = collect($response->json('data.assistant_message.leads') ?? [])
            ->pluck('name')
            ->all();
        $this->assertContains('Kobo Logistics', $names);
    }

    public function test_generate_more_uses_leftover_hit_urls(): void
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
            'name' => 'Logistics NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Nigeria'],
                'customPrompt' => 'logistics 3PL operators',
                'minMatchScore' => 1,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'title' => 'Leftover',
        ]);

        $organic = [];
        $names = [
            'Northstar Freight', 'Palmridge Warehousing', 'Cedarline 3PL', 'Riverton Haulage',
            'Oakmont Distribution', 'Silverline Freight', 'Mapleton Logistics', 'Harborline 3PL',
            'Pinecrest Warehousing', 'Goldridge Freight', 'Lakeshore 3PL', 'Summitline Haulage',
            'Westbrook Distribution', 'Ashford Freight', 'Brookvale 3PL',
        ];
        foreach ($names as $index => $name) {
            $slug = strtolower(str_replace(' ', '-', $name));
            $organic[] = [
                'title' => $name,
                'link' => "https://www.linkedin.com/company/{$slug}",
                'snippet' => 'Contract logistics and 3PL warehousing for retailers.',
            ];
        }

        Http::fake([
            'google.serper.dev/*' => Http::response(['organic' => $organic], 200),
        ]);

        $first = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'give me prospects (companies only)',
                'intent' => 'generate_leads',
            ]);

        $first->assertOk();
        $firstLeads = $first->json('data.assistant_message.leads') ?? [];
        $this->assertCount(12, $firstLeads);
        $firstNames = collect($firstLeads)->pluck('name')->all();

        $run = DiscoveryRun::query()->where('chat_session_id', $session->id)->latest('id')->first();
        $this->assertNotEmpty($run?->result_summary['unused_hits'] ?? []);

        $more = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'generate more prospects',
                'intent' => 'generate_more_leads',
            ]);

        $more->assertOk();
        $moreLeads = $more->json('data.assistant_message.leads') ?? [];
        $this->assertNotEmpty($moreLeads);
        $moreNames = collect($moreLeads)->pluck('name')->all();
        $this->assertEmpty(array_intersect($firstNames, $moreNames));
        $this->assertNotEmpty(array_intersect($names, $moreNames));
    }
}
