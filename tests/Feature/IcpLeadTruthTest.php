<?php

namespace Tests\Feature;

use App\Models\ChatSession;
use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IcpLeadTruthTest extends TestCase
{
    public function test_serper_credit_exhaustion_marks_run_degraded_and_says_so_in_chat(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.hunter.api_key' => 'test-hunter',
            'services.glm.api_key' => '',
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech Lagos',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 60,
                'enrichContactDetails' => false,
            ]),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response(['message' => 'Not enough credits'], 400),
            'api.hunter.io/v2/discover*' => Http::response([
                'data' => [
                    [
                        'domain' => 'globalbank.example',
                        'organization' => 'Global Bank Holdings',
                        'industry' => 'Financial Services',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Generate 6 leads',
                'intent' => 'generate_leads',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.assistant_message.meta.retrieval_degraded.web_search', true)
            ->assertJsonPath('data.assistant_message.meta.retrieval_degraded.reason', 'credits_exhausted');

        $body = mb_strtolower((string) $response->json('data.assistant_message.body'));
        $this->assertStringContainsString('web search', $body);

        $run = DiscoveryRun::query()->where('organization_id', $org->id)->latest('id')->firstOrFail();
        $summary = $run->result_summary ?? [];
        $this->assertTrue((bool) ($summary['retrieval_degraded'] ?? false));
        $this->assertSame('credits_exhausted', $summary['retrieval_degraded_reason'] ?? null);
        $this->assertGreaterThan(0, (int) ($summary['provider_failures']['serper']['failures'] ?? 0));
        $this->assertSame('credits_exhausted', $summary['provider_failures']['serper']['reason'] ?? null);
    }

    public function test_database_company_without_country_is_dropped_when_territories_are_set(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.hunter.api_key' => 'test-hunter',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech Lagos',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 60,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response(['organic' => []], 200),
            'api.hunter.io/v2/discover*' => Http::response([
                'data' => [
                    [
                        'domain' => 'globalbank.example',
                        'organization' => 'Global Bank Holdings',
                        'industry' => 'Financial Services',
                    ],
                    [
                        'domain' => 'worldtrust.example',
                        'organization' => 'World Trust Group',
                        'industry' => 'Financial Services',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'generate leads',
                'intent' => 'generate_leads',
                'limit' => 6,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $this->assertSame([], $response->json('data.leads') ?? []);

        $run = DiscoveryRun::query()->where('organization_id', $org->id)->latest('id')->firstOrFail();
        $summary = $run->result_summary ?? [];
        $this->assertGreaterThan(0, (int) ($summary['dropped_unverified_country'] ?? 0));
    }

    public function test_company_with_verified_country_still_passes_the_geo_gate(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.hunter.api_key' => 'test-hunter',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech Lagos',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response(['organic' => []], 200),
            'api.hunter.io/v2/discover*' => Http::response([
                'data' => [
                    [
                        'domain' => 'zedvance.com.ng',
                        'organization' => 'Zedvance Finance Limited',
                        'industry' => 'FinTech',
                        'country' => 'NG',
                        'city' => 'Lagos',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'generate leads',
                'intent' => 'generate_leads',
                'limit' => 4,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $names = array_column($response->json('data.leads') ?? [], 'name');
        $this->assertNotEmpty($names, 'A Hunter row with a confirmed Lagos address must survive the geo gate');
    }

    public function test_multi_country_icp_issues_serper_queries_for_each_country(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.hunter.api_key' => '',
            'services.glm.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Four markets',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Fintech & Payments'],
                'territories' => ['Lagos, Nigeria', 'London, England', 'Berlin, Germany', 'Paris, France'],
                'customPrompt' => 'fintech payment companies',
                'minMatchScore' => 1,
                'enrichContactDetails' => false,
            ]),
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'NovaPay | Company',
                        'link' => 'https://www.linkedin.com/company/novapay',
                        'snippet' => 'Fintech payment company.',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'generate leads (companies only)',
                'intent' => 'generate_leads',
                'limit' => 8,
            ]);

        $response->assertCreated()->assertJsonPath('data.status', 'completed');

        $gls = [];
        Http::assertSent(function ($request) use (&$gls) {
            if (! str_contains($request->url(), 'google.serper.dev')) {
                return false;
            }
            $gl = $request['gl'] ?? null;
            if (is_string($gl) && $gl !== '') {
                $gls[$gl] = true;
            }

            return true;
        });

        $this->assertArrayHasKey('ng', $gls);
        $this->assertArrayHasKey('uk', $gls);
        $this->assertArrayHasKey('de', $gls);
        $this->assertArrayHasKey('fr', $gls);
    }
}
