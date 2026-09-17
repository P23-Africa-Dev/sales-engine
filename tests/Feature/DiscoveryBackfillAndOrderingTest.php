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

            // Keep first-wave results thin so backfill must run (fan-out can be 6+ queries).
            if ($serperCalls <= 8) {
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

    public function test_fylings_and_hunter_are_called_once_per_collect_not_per_variation(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.serper.max_results' => 10,
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => 'test-hunter',
            'services.fylings.api_key' => 'test-fylings',
            'services.fylings.base_url' => 'https://api.fylings.com',
            'services.mono.secret_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Finance ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 1,
            ]),
        ]);

        $hunterCalls = 0;
        $fylingsCalls = 0;

        Http::fake(function ($request) use (&$hunterCalls, &$fylingsCalls) {
            $url = $request->url();
            if (str_contains($url, 'api.hunter.io/v2/discover')) {
                $hunterCalls++;

                return Http::response([
                    'data' => [
                        [
                            'domain' => 'hunter-lender.example',
                            'organization' => 'Hunter Lender Co',
                            'country' => 'NG',
                        ],
                    ],
                ], 200);
            }

            if (str_contains($url, 'api.fylings.com')) {
                $fylingsCalls++;

                return Http::response([
                    'data' => [
                        [
                            'id' => 'fy-1',
                            'name' => 'Fylings Lender Ltd',
                            'country' => 'NG',
                            'website' => 'https://fylings-lender.example',
                        ],
                    ],
                ], 200);
            }

            if (str_contains($url, 'google.serper.dev')) {
                return Http::response([
                    'organic' => [
                        [
                            'title' => 'Serper Lender Ltd | Home',
                            'link' => 'https://serper-lender.example.com',
                            'snippet' => 'Working capital lender in Lagos.',
                        ],
                    ],
                ], 200);
            }

            return Http::response(['error' => 'unexpected ' . $url], 500);
        });

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'Give me 20 Merchant cash advance lenders in Lagos and Abuja',
                'intent' => 'generate_leads',
                'limit' => 20,
            ]);

        $response->assertCreated()->assertJsonPath('data.status', 'completed');

        // Fan-out runs multiple Serper queries; registry sources must stay once per collectHits
        // (and cached across backfill with the same primary query).
        $this->assertLessThanOrEqual(3, $hunterCalls, 'Hunter should not run per Serper variation');
        $this->assertLessThanOrEqual(3, $fylingsCalls, 'Fylings should not run per Serper variation');
        $this->assertGreaterThanOrEqual(1, $hunterCalls);
        $this->assertGreaterThanOrEqual(1, $fylingsCalls);
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
