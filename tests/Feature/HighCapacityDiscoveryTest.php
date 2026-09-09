<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HighCapacityDiscoveryTest extends TestCase
{
    public function test_fifty_lead_request_fans_out_multiple_serper_queries(): void
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
                'industries' => ['SaaS', 'Fintech', 'Cloud'],
                'territories' => ['United States', 'Canada', 'United Kingdom'],
                'decisionMakers' => ['CEO', 'CTO', 'VP Sales', 'Founder'],
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
            for ($i = 0; $i < 10; $i++) {
                $n = ($serperCalls * 10) + $i;
                $organic[] = [
                    'title' => "Northstar Labs {$n} Inc | Home",
                    'link' => "https://northstar-labs-{$n}.example.com",
                    'snippet' => "B2B SaaS platform company {$n} serving North America.",
                ];
            }

            return Http::response(['organic' => $organic], 200);
        });

        $started = microtime(true);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'Find 50 SaaS companies in North America',
                'intent' => 'generate_leads',
                'limit' => 50,
            ]);

        $elapsedMs = (microtime(true) - $started) * 1000;

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $summary = $response->json('data.result_summary');
        $leads = $response->json('data.leads') ?? [];

        $this->assertTrue((bool) ($summary['fan_out_strategy_used'] ?? false));
        $this->assertGreaterThanOrEqual(3, count($summary['queries_executed'] ?? []));
        $this->assertLessThanOrEqual(15, count($summary['queries_executed'] ?? []));
        $this->assertGreaterThanOrEqual(3, $serperCalls);
        $this->assertGreaterThanOrEqual(40, count($leads), 'Expected at least 40 leads from fan-out discovery');
        $this->assertLessThanOrEqual(50, count($leads));
        $this->assertLessThan(60_000, $elapsedMs, 'Fan-out discovery should complete under 60s with mocked HTTP');

        $estimatedCost = count($summary['queries_executed'] ?? []) * 0.005;
        $this->assertLessThanOrEqual(0.075, $estimatedCost);
    }

    public function test_hundred_lead_request_caps_query_budget_and_returns_large_set(): void
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
            'name' => 'Growth ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS', 'Fintech', 'HealthTech', 'EdTech', 'Climate'],
                'territories' => ['United States', 'Canada', 'United Kingdom'],
                'decisionMakers' => ['CEO', 'CTO', 'VP Sales', 'Founder', 'COO'],
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
            for ($i = 0; $i < 10; $i++) {
                $n = ($serperCalls * 10) + $i;
                $organic[] = [
                    'title' => "Brightpath Software {$n} LLC | Home",
                    'link' => "https://brightpath-{$n}.example.com",
                    'snippet' => "Enterprise software company {$n} expanding globally.",
                ];
            }

            return Http::response(['organic' => $organic], 200);
        });

        $started = microtime(true);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'Find 100 SaaS companies',
                'intent' => 'generate_leads',
                'limit' => 100,
            ]);

        $elapsedMs = (microtime(true) - $started) * 1000;

        $response->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $summary = $response->json('data.result_summary');
        $leads = $response->json('data.leads') ?? [];

        $this->assertTrue((bool) ($summary['fan_out_strategy_used'] ?? false));
        $this->assertLessThanOrEqual(15, count($summary['queries_executed'] ?? []));
        $this->assertSame('volume', $summary['quality_threshold'] ?? null);
        $this->assertGreaterThanOrEqual(50, count($leads));
        $this->assertLessThanOrEqual(100, count($leads));
        $this->assertLessThan(60_000, $elapsedMs);
        $this->assertLessThanOrEqual(30, $serperCalls);
    }
}
