<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\Adapters\HunterDiscoveryAdapter;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HunterDiscoveryAdapterTest extends TestCase
{
    public function test_disabled_without_api_key(): void
    {
        config(['services.hunter.api_key' => '']);

        $adapter = new HunterDiscoveryAdapter;

        $this->assertFalse($adapter->isEnabled());
        $this->assertTrue($adapter->search($this->brief(), new SearchContext(1, 1, 20, 'generate_leads'))->isEmpty());
    }

    public function test_maps_discover_companies_to_hits(): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key']);

        Http::fake([
            'api.hunter.io/v2/discover*' => Http::response([
                'data' => [
                    [
                        'domain' => 'zedvance.com',
                        'organization' => 'Zedvance Finance Limited',
                        'industry' => 'Financial Services',
                        'country' => 'NG',
                        'city' => 'Lagos',
                    ],
                    [
                        'domain' => 'greenbox.ng',
                        'organization' => 'Greenbox Capital',
                        'industry' => 'Financial Services',
                        'country' => 'NG',
                    ],
                ],
                'meta' => ['results' => 2, 'limit' => 100, 'offset' => 0],
            ], 200),
        ]);

        $adapter = new HunterDiscoveryAdapter;
        $hits = $adapter->search($this->brief(), new SearchContext(1, 1, 20, 'generate_leads'));

        $this->assertTrue($adapter->isEnabled());
        $this->assertCount(2, $hits);
        $this->assertSame('hunter', $hits[0]->provider);
        $this->assertSame('database', $hits[0]->source);
        $this->assertSame('Zedvance Finance Limited', $hits[0]->name);
        $this->assertStringContainsString('zedvance.com', (string) $hits[0]->url);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'api.hunter.io/v2/discover')
                && ($request['query'] ?? null) !== null;
        });
    }

    public function test_caps_results_to_context_limit(): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key']);

        $rows = [];
        for ($i = 1; $i <= 15; $i++) {
            $rows[] = [
                'domain' => "co{$i}.example",
                'organization' => "Company {$i}",
            ];
        }

        Http::fake([
            'api.hunter.io/v2/discover*' => Http::response(['data' => $rows], 200),
        ]);

        $adapter = new HunterDiscoveryAdapter;
        $hits = $adapter->search($this->brief(), new SearchContext(1, 1, 5, 'generate_leads'));

        $this->assertCount(5, $hits);
    }

    private function brief(): IcpBrief
    {
        return new IcpBrief(
            name: 'Finance',
            description: '',
            industries: ['FinTech'],
            territories: ['Lagos, NG'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: 'working capital lenders in Lagos and Abuja',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 20,
        );
    }
}
