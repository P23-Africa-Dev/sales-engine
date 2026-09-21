<?php

namespace Tests\Feature;

use App\Models\CompanyContact;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Services\Outreach\OutreachDraftService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DiscoveryTest extends TestCase
{
    public function test_discovery_run_uses_serper_and_respects_active_icp(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

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

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Acme Distributors Lagos | Home',
                        'link' => 'https://acme.example.com',
                        'snippet' => 'Leading FMCG distributor in Lagos.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'FMCG distributors Lagos',
                'intent' => 'generate_leads',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.leads.0.name', 'Acme Distributors Lagos');

        $this->assertNotEmpty($response->json('data.leads.0.icp_relevance_reason'));

        $this->assertDatabaseHas('companies', [
            'organization_id' => $org->id,
            'name' => 'Acme Distributors Lagos',
        ]);
        $this->assertDatabaseHas('api_usage', [
            'organization_id' => $org->id,
            'provider' => 'serper',
        ]);
    }

    public function test_user_query_outside_icp_still_returns_leads_with_advisory_flags(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tech Health ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Health Tech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 95,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Global Retail Holdings',
                        'link' => 'https://global-retail.example.com',
                        'snippet' => 'Major global retail conglomerate outside health tech.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'top retail conglomerates worldwide',
                'intent' => 'generate_leads',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.leads.0.name', 'Global Retail Holdings')
            ->assertJsonPath('data.leads.0.icp_recommended', false)
            ->assertJsonPath('data.leads.0.query_match', true);
    }

    public function test_listicle_people_query_extracts_named_leads(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'General ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'minMatchScore' => 95,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Top 10 Wealthiest Men in the World',
                        'link' => 'https://example.com/blog/top-10-wealthiest-men',
                        'snippet' => '1. Bernard Arnault 2. Elon Musk 3. Jeff Bezos',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'create leads for the top 10 wealthiest men',
                'intent' => 'generate_leads',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $leads = $response->json('data.leads');
        $this->assertNotEmpty($leads);
        $names = array_column($leads, 'name');
        $this->assertContains('Bernard Arnault', $names);
        $this->assertContains('Elon Musk', $names);
        $this->assertTrue($leads[0]['query_match']);
    }

    public function test_whatsapp_send_requires_opt_in(): void
    {
        [, $org] = $this->actingAsOrgMember();
        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $contact = CompanyContact::query()->create([
            'company_id' => \App\Models\Company::query()->create([
                'organization_id' => $org->id,
                'name' => 'Co',
                'normalized_name' => 'co',
            ])->id,
            'name' => 'Buyer',
            'whatsapp_opt_in' => false,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/draft', [
                'prompt' => 'Say hello',
                'channel' => 'whatsapp',
                'contact_id' => $contact->id,
                'send' => true,
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'WhatsApp messages require explicit opt-in (whatsapp_opt_in_at).']);
    }

    public function test_outreach_draft_service_blocks_send_without_opt_in(): void
    {
        $service = app(OutreachDraftService::class);
        $this->expectException(\InvalidArgumentException::class);
        $service->assertCanSendWhatsApp(null);
    }

    public function test_crm_pipeline_move_lead(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Pipeline Co',
            'stage' => 'new',
            'score' => 80,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->patchJson("/api/v1/crm/leads/{$lead->id}", ['stage' => 'qualified'])
            ->assertOk()
            ->assertJsonPath('data.stage', 'qualified');
    }

    public function test_article_and_advice_hits_do_not_become_leads(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Sales ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => '11 Tips to Generate Sales Leads',
                        'link' => 'https://example.com/blog/11-tips-sales-leads',
                        'snippet' => 'Advice content about finding leads.',
                    ],
                    [
                        'title' => 'How I Find 100 Qualified Leads',
                        'link' => 'https://example.com/articles/how-i-find-leads',
                        'snippet' => 'Personal advice article.',
                    ],
                    [
                        'title' => 'Scaling CEO Peer Groups with Targeted Outreach',
                        'link' => 'https://linkedin.com/posts/someone-scaling-ceo',
                        'snippet' => 'LinkedIn post about peer groups.',
                    ],
                    [
                        'title' => 'Matching Requirement',
                        'link' => 'https://example.com/matching-requirement',
                        'snippet' => 'Generic requirement phrase.',
                    ],
                    [
                        'title' => '500 Qualified Leads Award',
                        'link' => 'https://example.com/awards/500-leads',
                        'snippet' => 'Award announcement content.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'SaaS companies in Lagos',
                'intent' => 'generate_leads',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $leads = $response->json('data.leads') ?? [];
        $this->assertSame([], $leads);
        $this->assertDatabaseCount('leads', 0);
    }

    public function test_discovery_payload_exposes_contact_fields(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Acme Distributors Lagos | Home',
                        'link' => 'https://acme.example.com',
                        'snippet' => 'Leading FMCG distributor in Lagos.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'FMCG distributors Lagos',
                'intent' => 'generate_leads',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.leads.0.name', 'Acme Distributors Lagos')
            ->assertJsonPath('data.leads.0.contact_ready', false);

        $this->assertArrayHasKey('email', $response->json('data.leads.0'));
        $this->assertArrayHasKey('phone', $response->json('data.leads.0'));
        $this->assertArrayHasKey('linkedin_url', $response->json('data.leads.0'));

        // enrichContactDetails is off on this ICP — must read as "never attempted",
        // not "attempted and found nothing" (contact_ready alone can't tell the two apart).
        $lead = \App\Models\Lead::query()->where('organization_id', $org->id)->firstOrFail();
        $this->assertSame('not_attempted', $lead->meta['contact_status'] ?? null);
        $this->assertSame('not_attempted', (new \App\Http\Resources\LeadResource($lead))->toArray(request())['contact_status']);
    }

    public function test_lead_resource_exposes_contact_fields(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Jane Doe',
            'stage' => 'new',
            'score' => 80,
            'meta' => [
                'entity_type' => 'person',
                'title' => 'CEO',
                'company' => 'Acme',
                'email' => 'jane@acme.example.com',
                'phone' => '+1234567890',
                'linkedin_url' => 'https://linkedin.com/in/jane-doe',
                'contact_ready' => true,
            ],
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->patchJson("/api/v1/crm/leads/{$lead->id}", ['stage' => 'contacted'])
            ->assertOk()
            ->assertJsonPath('data.email', 'jane@acme.example.com')
            ->assertJsonPath('data.phone', '+1234567890')
            ->assertJsonPath('data.linkedin_url', 'https://linkedin.com/in/jane-doe')
            ->assertJsonPath('data.contact_ready', true)
            ->assertJsonPath('data.entity_type', 'person');
    }

    public function test_company_prompt_sets_entity_type_company_and_keeps_company_name(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Paystack | Home',
                        'link' => 'https://www.linkedin.com/company/paystack',
                        'snippet' => 'FinTech payments company in Lagos.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'FinTech companies in Lagos',
                'intent' => 'generate_leads',
                'limit' => 5,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.leads.0.entity_type', 'company');

        $leadName = (string) $response->json('data.leads.0.name');
        $this->assertNotSame('', $leadName);
        $this->assertStringContainsStringIgnoringCase('Paystack', $leadName);

        $lead = Lead::query()->where('organization_id', $org->id)->first();
        $this->assertNotNull($lead);
        $this->assertSame('company', $lead->meta['entity_type'] ?? null);
        $this->assertSame($leadName, $lead->name);
    }

    public function test_people_prompt_sets_entity_type_person(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Ada Okoye - CEO at NovaPay',
                        'link' => 'https://www.linkedin.com/in/ada-okoye',
                        'snippet' => 'CEO at NovaPay, FinTech startup in Lagos.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'CEOs at FinTech startups',
                'intent' => 'generate_leads',
                'limit' => 5,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.leads.0.entity_type', 'person');

        $leadName = (string) $response->json('data.leads.0.name');
        $this->assertStringContainsStringIgnoringCase('Ada', $leadName);
    }

    public function test_both_prompt_returns_mixed_entity_types_within_limit(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'OrbitPay | Company',
                        'link' => 'https://www.linkedin.com/company/orbitpay',
                        'snippet' => 'FinTech company in Lagos.',
                    ],
                    [
                        'title' => 'Chidi Bassey - Founder at OrbitPay',
                        'link' => 'https://www.linkedin.com/in/chidi-bassey',
                        'snippet' => 'Founder at OrbitPay.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'companies and their founders',
                'intent' => 'generate_leads',
                'limit' => 4,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $leads = $response->json('data.leads') ?? [];
        $this->assertLessThanOrEqual(4, count($leads));
        $types = collect($leads)->pluck('entity_type')->unique()->sort()->values()->all();
        $this->assertContains('company', $types);
        $this->assertContains('person', $types);

        $stages = $response->json('data.stages') ?? [];
        $this->assertContains('company_pass', $stages);
        $this->assertContains('people_pass', $stages);
    }

    public function test_ambiguous_generate_defaults_to_both_and_keeps_linkedin_urls(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'OrbitPay | Company',
                        'link' => 'https://www.linkedin.com/company/orbitpay',
                        'snippet' => 'FinTech company in Lagos.',
                    ],
                    [
                        'title' => 'Chidi Bassey - Founder at OrbitPay',
                        'link' => 'https://www.linkedin.com/in/chidi-bassey',
                        'snippet' => 'Founder at OrbitPay.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'Generate 20 more leads',
                'intent' => 'generate_leads',
                'limit' => 4,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $leads = $response->json('data.leads') ?? [];
        $this->assertNotEmpty($leads);
        $types = collect($leads)->pluck('entity_type')->unique()->sort()->values()->all();
        $this->assertContains('company', $types);
        $this->assertContains('person', $types);

        $stages = $response->json('data.stages') ?? [];
        $this->assertContains('company_pass', $stages);
        $this->assertContains('people_pass', $stages);

        $withLinkedIn = collect($leads)->first(
            fn($lead) => filled($lead['linkedin_url'] ?? null) || filled($lead['profile_urls'][0] ?? null)
        );
        $this->assertNotNull($withLinkedIn, 'Expected at least one lead to retain a LinkedIn/profile URL from the hit');
        $linkedin = (string) ($withLinkedIn['linkedin_url'] ?? ($withLinkedIn['profile_urls'][0] ?? ''));
        $this->assertStringContainsString('linkedin.com', mb_strtolower($linkedin));
    }

    public function test_cancel_soft_failed_run_awaiting_user_choice(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tech',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = \App\Models\ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'title' => 'Generate',
        ]);

        $run = \App\Models\DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'failed',
            'query' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'error' => 'ProcessChatIntentJob has timed out.',
            'finished_at' => now(),
        ]);

        $placeholder = \App\Models\ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Lead search is taking longer than usual.',
            'intent' => 'generate_leads',
            'meta' => [
                'pending' => true,
                'awaiting_user_choice' => true,
                'discovery_run_id' => $run->id,
            ],
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/discovery/runs/{$run->id}/cancel");

        $response->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancelled', true);

        $run->refresh();
        $placeholder->refresh();
        $this->assertSame('cancelled', $run->status);
        $this->assertFalse((bool) ($placeholder->meta['pending'] ?? true));
        $this->assertTrue((bool) ($placeholder->meta['cancelled'] ?? false));
        $this->assertStringContainsString('stopped', mb_strtolower($placeholder->body));
    }
}
