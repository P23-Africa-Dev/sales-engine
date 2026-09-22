<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\Adapters\SerperDiscoveryAdapter;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SerperDiscoveryAdapterGeoTest extends TestCase
{
    public function test_nigeria_icp_sends_gl_and_location_and_does_not_stamp_hits(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Pune Logistics Ltd',
                        'link' => 'https://www.linkedin.com/company/pune-logistics',
                        'snippet' => '3PL operator in India.',
                    ],
                ],
            ], 200),
        ]);

        $adapter = app(SerperDiscoveryAdapter::class);
        $brief = new IcpBrief(
            name: 'Logistics NG',
            description: '',
            industries: ['Logistics'],
            territories: ['Lagos, NG'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: 'logistics 3PL operators',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            target: QueryIntentService::TARGET_COMPANIES,
        );

        $hits = $adapter->search($brief, new SearchContext(1, 1, 12, 'generate_leads'));

        $this->assertCount(1, $hits);
        $this->assertNull($hits[0]->location);
        $this->assertNull($hits[0]->sector);

        Http::assertSent(function ($request) {
            $data = $request->data();

            return ($data['gl'] ?? null) === 'ng'
                && str_contains((string) ($data['location'] ?? ''), 'Nigeria');
        });
    }
}
