<?php

namespace Tests\Unit\Extraction;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\QueryIntentService;
use App\Services\Extraction\ExtractionService;
use App\Services\Llm\GlmClient;
use Tests\TestCase;

class ExtractionServiceTest extends TestCase
{
    public function test_listicle_extraction_does_not_use_article_url_as_linkedin(): void
    {
        config(['services.glm.api_key' => '']);

        $service = new ExtractionService(
            new GlmClient,
            new QueryIntentService,
        );

        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'ICP',
                'is_active' => true,
                'config' => IcpProfile::defaultConfig(),
            ]),
            'top 10 wealthiest men',
        );

        $hit = new RawDiscoveryHit(
            name: 'Top 10 Richest People',
            snippet: '1. Elon Musk · 2. Larry Page · 3. Jeff Bezos',
            url: 'https://example.com/blog/top-10-richest-people',
            source: 'serper',
            provider: 'serper',
        );

        $people = $service->extractMany($hit, $brief, $org);

        $this->assertNotEmpty($people);
        foreach ($people as $person) {
            $this->assertNull($person['linkedin_url'] ?? null);
            $this->assertSame('', $person['summary'] ?? '');
        }
    }

    public function test_listicle_glm_extraction_rejects_shared_snippet_as_summary(): void
    {
        config([
            'services.glm.api_key' => 'test',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
        ]);

        \Illuminate\Support\Facades\Http::fake([
            'glm.example.com/*' => \Illuminate\Support\Facades\Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'people' => [[
                                'person_name' => 'Elon Musk',
                                'title' => 'CEO',
                                'company' => 'Tesla',
                                'summary' => '1. Elon Musk · 2. Larry Page',
                            ]],
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        $service = app(ExtractionService::class);
        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'ICP',
                'is_active' => true,
                'config' => IcpProfile::defaultConfig(),
            ]),
            'top 10 wealthiest men',
        );

        $hit = new RawDiscoveryHit(
            name: 'Top 10 Richest People',
            snippet: '1. Elon Musk · 2. Larry Page',
            url: 'https://example.com/blog/top-10-richest',
            source: 'serper',
            provider: 'serper',
        );

        $people = $service->extractMany($hit, $brief, $org);

        $this->assertCount(1, $people);
        $this->assertSame('CEO', $people[0]['title']);
        $this->assertSame('Tesla', $people[0]['company']);
        $this->assertSame('', $people[0]['summary']);
        $this->assertNull($people[0]['linkedin_url'] ?? null);
    }

    public function test_company_fallback_does_not_fill_location_from_icp(): void
    {
        config(['services.glm.api_key' => '']);

        $service = new ExtractionService(
            new GlmClient,
            new QueryIntentService,
        );

        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'NG ICP',
                'is_active' => true,
                'config' => array_merge(IcpProfile::defaultConfig(), [
                    'territories' => ['Nigeria'],
                    'customPrompt' => 'logistics 3PL',
                ]),
            ]),
            'give me prospects',
        );

        $hit = new RawDiscoveryHit(
            name: 'Northstar Freight Co',
            snippet: 'Nationwide freight directory listing.',
            url: 'https://example.com/northstar-freight',
            source: 'serper',
            provider: 'serper',
            location: null,
            sector: null,
        );

        $extracted = $service->extract($hit, $brief, $org);

        $this->assertNull($extracted['location'] ?? null);
    }
}
