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
            ->assertJsonPath('data.contact_ready', true);
    }
}
