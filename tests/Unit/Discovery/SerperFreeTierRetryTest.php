<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\Adapters\SerperDiscoveryAdapter;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SerperFreeTierRetryTest extends TestCase
{
    public function test_retries_with_safer_num_when_free_tier_blocks_complex_query(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.serper.max_results' => 20,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::sequence()
                ->push(['message' => 'Query pattern not allowed for free accounts.', 'statusCode' => 400], 400)
                ->push([
                    'organic' => [
                        [
                            'title' => 'Ada Okonkwo — CEO, Paystack',
                            'link' => 'https://linkedin.com/in/ada-okonkwo',
                            'snippet' => 'CEO building payments infrastructure in Lagos.',
                        ],
                    ],
                ], 200),
        ]);

        $adapter = app(SerperDiscoveryAdapter::class);
        $brief = new IcpBrief(
            name: 'Tech',
            description: '',
            industries: ['FinTech'],
            territories: ['Africa'],
            companySizes: [],
            decisionMakers: ['Managing Director / CEO'],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: 'CEOs of FinTech startups in Africa',
            target: QueryIntentService::TARGET_PEOPLE,
            requestedLimit: 40,
            searchQueryOverride: 'CEOs of FinTech startups in Africa "Managing Director / CEO"',
        );

        $hits = $adapter->search($brief, new SearchContext(1, 1, 40, 'generate_leads'));

        $this->assertGreaterThanOrEqual(1, $hits->count());
        Http::assertSentCount(2);
    }

    public function test_max_results_config_caps_num_param(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.serper.max_results' => 10,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Northstar Labs',
                        'link' => 'https://northstar.example.com',
                        'snippet' => 'B2B SaaS company',
                    ],
                ],
            ], 200),
        ]);

        $adapter = app(SerperDiscoveryAdapter::class);
        $brief = new IcpBrief(
            name: 'Tech',
            description: '',
            industries: ['SaaS'],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: 'SaaS companies',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 50,
        );

        $adapter->search($brief, new SearchContext(1, 1, 50, 'generate_leads'));

        Http::assertSent(function ($request) {
            $data = $request->data();

            return ($data['num'] ?? null) === 10;
        });
    }
}
