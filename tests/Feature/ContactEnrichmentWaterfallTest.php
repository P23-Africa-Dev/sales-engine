<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ContactEnrichmentWaterfallTest extends TestCase
{
    public function test_enrichment_waterfall_prefers_snippet_contacts_before_bytemine(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();
        Cache::flush();

        Http::fake([
            'google.serper.dev/search' => Http::response([
                'organic' => [
                    [
                        'title' => 'Jane Doe — Acme',
                        'link' => 'https://www.linkedin.com/in/janedoe',
                        'snippet' => 'Contact jane.doe@acme.com or call +1 415-555-0100.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'title' => 'CEO',
                            'company_name' => 'Acme',
                            'location' => 'SF',
                            'website' => 'https://acme.com',
                            'email' => '',
                            'phone' => '',
                            'profile_urls' => ['https://www.linkedin.com/in/janedoe'],
                            'summary' => 'Jane Doe is CEO of Acme.',
                            'next_action' => 'Review profile and draft outreach',
                            'confidence' => 70,
                        ]),
                    ],
                ]],
            ], 200),
            'bytemine.example.com/*' => Http::response(['should' => 'not be called'], 500),
        ]);

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Default',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $profile = app(LeadProfileEnrichmentService::class)->enrich(
            $org,
            $icp,
            'Jane Doe',
            'find decision makers',
        );

        $this->assertSame('jane.doe@acme.com', $profile->email);
        $this->assertNotEmpty($profile->phone);
        $this->assertSame('tier1', $profile->contactEnrichmentTier);
        $this->assertSame('snippet_extractor', $profile->contactEnrichmentProvider);

        Http::assertNotSent(fn($request) => str_contains($request->url(), 'bytemine.example.com'));
    }

    public function test_enrichment_waterfall_uses_bytemine_when_snippets_incomplete(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => 'apollo-should-not-run',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();
        Cache::flush();

        Http::fake([
            'google.serper.dev/search' => Http::response([
                'organic' => [
                    [
                        'title' => 'Jane Doe | LinkedIn',
                        'link' => 'https://www.linkedin.com/in/janedoe',
                        'snippet' => 'CEO at Acme Corp.',
                    ],
                ],
            ], 200),
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'title' => 'CEO',
                            'company_name' => 'Acme',
                            'location' => '',
                            'website' => 'https://acme.com',
                            'email' => '',
                            'phone' => '',
                            'profile_urls' => ['https://www.linkedin.com/in/janedoe'],
                            'summary' => 'Jane Doe leads Acme.',
                            'next_action' => 'Review profile and draft outreach',
                            'confidence' => 65,
                        ]),
                    ],
                ]],
            ], 200),
            'bytemine.example.com/v1/people/enrich' => Http::response([
                'matched' => true,
                'credits_charged' => 1,
                'workEmail' => 'jane@acme.com',
                'mobilePhone' => '+15551230000',
            ], 200),
            'api.apollo.io/*' => Http::response(['people' => []], 200),
        ]);

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Default',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $profile = app(LeadProfileEnrichmentService::class)->enrich(
            $org,
            $icp,
            'Jane Doe',
            'find decision makers',
        );

        $this->assertSame('jane@acme.com', $profile->email);
        $this->assertSame('+15551230000', $profile->phone);
        $this->assertSame('tier2', $profile->contactEnrichmentTier);
        $this->assertSame('bytemine', $profile->contactEnrichmentProvider);

        Http::assertNotSent(fn($request) => str_contains($request->url(), 'api.apollo.io'));
    }
}
