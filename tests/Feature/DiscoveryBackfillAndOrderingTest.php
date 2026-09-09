<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DiscoveryBackfillAndOrderingTest extends TestCase
{
    public function test_low_yield_triggers_backfill_passes_capped_at_two(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'SaaS ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS', 'Fintech'],
                'territories' => ['United States'],
                'decisionMakers' => ['CEO', 'Founder'],
                'minMatchScore' => 1,
            ]),
        ]);

        $serperCalls = 0;
        Http::fake(function ($request) use (&$serperCalls) {
            if (! str_contains($request->url(), 'google.serper.dev')) {
                return Http::response(['error' => 'unexpected'], 500);
            }

            $serperCalls++;
            $organic = [];

            // First pass (~4 queries): only 2 unique companies → under minAcceptableYield for limit 20.
            if ($serperCalls <= 4) {
                $organic = [
                    [
                        'title' => 'Alpha Software Inc | Home',
                        'link' => 'https://alpha-software.example.com',
                        'snippet' => 'B2B SaaS platform serving enterprises.',
                    ],
                    [
                        'title' => 'Beta Cloud Co | Home',
                        'link' => 'https://beta-cloud.example.com',
                        'snippet' => 'Cloud SaaS company expanding globally.',
                    ],
                ];
            } else {
                // Backfill passes: many unique companies.
                for ($i = 0; $i < 20; $i++) {
                    $n = ($serperCalls * 20) + $i;
                    $organic[] = [
                        'title' => "Gamma Labs {$n} Inc | Home",
                        'link' => "https://gamma-labs-{$n}.example.com",
                        'snippet' => "SaaS company {$n} serving North America.",
                    ];
                }
            }

            return Http::response(['organic' => $organic], 200);
        });

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'Find 20 SaaS companies',
                'intent' => 'generate_leads',
                'limit' => 20,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $summary = $response->json('data.result_summary');
        $leads = $response->json('data.leads') ?? [];

        $this->assertGreaterThanOrEqual(1, (int) ($summary['backfill_passes'] ?? 0));
        $this->assertLessThanOrEqual(2, (int) ($summary['backfill_passes'] ?? 0));
        $this->assertGreaterThan(2, count($leads), 'Backfill should increase yield beyond the first-pass 2 leads');
        $this->assertGreaterThan(4, $serperCalls, 'Backfill should issue additional Serper queries');
    }

    public function test_leads_ordered_icp_recommended_first(): void
    {
        $orchestrator = app(\App\Services\Discovery\DiscoveryOrchestrator::class);
        $method = new \ReflectionMethod($orchestrator, 'sortLeadsPayload');
        $method->setAccessible(true);

        $sorted = $method->invoke($orchestrator, [
            [
                'name' => 'Retail Conglomerate',
                'icp_recommended' => false,
                'query_match' => true,
                'score' => 88,
            ],
            [
                'name' => 'Health Tech Match',
                'icp_recommended' => true,
                'query_match' => true,
                'score' => 55,
            ],
            [
                'name' => 'Another Weak Fit',
                'icp_recommended' => false,
                'query_match' => true,
                'score' => 70,
            ],
        ]);

        $this->assertSame('Health Tech Match', $sorted[0]['name']);
        $this->assertTrue((bool) $sorted[0]['icp_recommended']);
        $this->assertFalse((bool) $sorted[1]['icp_recommended']);
        $this->assertFalse((bool) $sorted[2]['icp_recommended']);
        $this->assertSame(88, $sorted[1]['score']); // higher priority among below-threshold
    }
}
