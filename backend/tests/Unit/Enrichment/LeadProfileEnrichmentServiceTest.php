<?php

namespace Tests\Unit\Enrichment;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\QueryIntentService;
use App\Services\Enrichment\ApolloPersonEnricher;
use App\Services\Enrichment\HunterEmailEnricher;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use App\Services\Enrichment\SerperPersonSearchAdapter;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeadProfileEnrichmentServiceTest extends TestCase
{
    public function test_enriches_person_with_title_company_and_profile_urls(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();
        Cache::flush();

        Http::fake([
            'google.serper.dev/search' => Http::response([
                'organic' => [
                    [
                        'title' => 'Elon Musk - Wikipedia',
                        'link' => 'https://en.wikipedia.org/wiki/Elon_Musk',
                        'snippet' => 'Elon Musk is CEO of Tesla and SpaceX.',
                    ],
                    [
                        'title' => 'Elon Musk | LinkedIn',
                        'link' => 'https://www.linkedin.com/in/elonmusk',
                        'snippet' => 'CEO at Tesla.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'title' => 'CEO',
                            'company_name' => 'Tesla',
                            'location' => 'Austin, TX',
                            'website' => 'https://tesla.com',
                            'profile_urls' => [
                                'https://www.linkedin.com/in/elonmusk',
                                'https://en.wikipedia.org/wiki/Elon_Musk',
                            ],
                            'summary' => 'Elon Musk leads Tesla and SpaceX as CEO.',
                            'next_action' => 'Review profile and draft outreach',
                            'confidence' => 85,
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Default',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $service = app(LeadProfileEnrichmentService::class);
        $profile = $service->enrich($org, $icp, 'Elon Musk', 'top wealthiest men');

        $this->assertSame('CEO', $profile->title);
        $this->assertSame('Tesla', $profile->companyName);
        $this->assertNotEmpty($profile->profileUrls);
        $this->assertStringContainsString('linkedin.com/in/', $profile->profileUrls[0]);
        $this->assertSame('Elon Musk leads Tesla and SpaceX as CEO.', $profile->summary);
        $this->assertSame('Review profile and draft outreach', $profile->nextAction);
        $this->assertTrue($profile->enrichmentAttempted);
    }

    public function test_skips_enrichment_when_icp_flag_disabled(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'No enrich',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), ['enrichContactDetails' => false]),
        ]);

        Http::fake();

        $service = app(LeadProfileEnrichmentService::class);
        $profile = $service->enrich($org, $icp, 'Elon Musk', 'query');

        $this->assertSame('', $profile->title);
        $this->assertSame('', $profile->companyName);
        $this->assertFalse($profile->enrichmentAttempted);
        Http::assertNothingSent();
    }

    public function test_merge_into_extraction_overwrites_empty_fields(): void
    {
        $profile = new \App\Services\Enrichment\DTO\EnrichedLeadProfile(
            title: 'Founder',
            companyName: 'Acme',
            profileUrls: ['https://linkedin.com/in/jane'],
            summary: 'Jane founded Acme.',
            nextAction: 'Review profile and draft outreach',
            confidence: 80,
        );

        $merged = $profile->mergeIntoExtraction([
            'person_name' => 'Jane Doe',
            'summary' => '1. Jane · 2. John',
        ]);

        $this->assertSame('Founder', $merged['title']);
        $this->assertSame('Acme', $merged['company']);
        $this->assertSame('Jane founded Acme.', $merged['summary']);
        $this->assertSame(['https://linkedin.com/in/jane'], $merged['profile_urls']);
    }

    public function test_merge_into_extraction_carries_enrichment_attempted_flag(): void
    {
        $attempted = new \App\Services\Enrichment\DTO\EnrichedLeadProfile(title: 'Founder', enrichmentAttempted: true);
        $notAttempted = new \App\Services\Enrichment\DTO\EnrichedLeadProfile(enrichmentAttempted: false);

        $this->assertTrue($attempted->mergeIntoExtraction([])['enrichment_attempted']);
        $this->assertFalse($notAttempted->mergeIntoExtraction([])['enrichment_attempted']);
    }

    public function test_with_enrichment_attempted_returns_an_immutable_copy(): void
    {
        $original = new \App\Services\Enrichment\DTO\EnrichedLeadProfile(title: 'Founder', enrichmentAttempted: false);
        $updated = $original->withEnrichmentAttempted(true);

        $this->assertFalse($original->enrichmentAttempted);
        $this->assertTrue($updated->enrichmentAttempted);
        $this->assertSame('Founder', $updated->title);
    }
}
