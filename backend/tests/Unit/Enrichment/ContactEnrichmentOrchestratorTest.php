<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ContactEnrichmentOrchestratorTest extends TestCase
{
    public function test_tier1_snippet_extraction_skips_paid_providers(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.bytemine.api_key' => 'bm-should-not-call',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => 'cl-should-not-call',
            'services.apollo.api_key' => 'apollo-should-not-call',
            'services.hunter.api_key' => 'hunter-should-not-call',
        ]);

        [, $org] = $this->actingAsOrgMember();
        Http::fake();

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            ['company' => 'Acme'],
            [
                [
                    'title' => 'Jane Doe',
                    'snippet' => 'Email jane.doe@acme.com · Mobile +14155550123',
                    'url' => 'https://acme.com/team/jane',
                ],
            ],
        );

        $this->assertSame('jane.doe@acme.com', $result['email']);
        $this->assertNotEmpty($result['phone']);
        $this->assertSame('tier1', $result['tier']);
        $this->assertSame('snippet_extractor', $result['provider']);

        Http::assertNothingSent();
        $this->assertDatabaseHas('enrichment_logs', [
            'organization_id' => $org->id,
            'tier' => 'tier1',
            'provider' => 'snippet_extractor',
            'found_email' => 1,
        ]);
    }

    public function test_falls_back_to_bytemine_when_snippets_lack_contacts(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'bytemine.example.com/v1/people/enrich' => Http::response([
                'matched' => true,
                'credits_charged' => 1,
                'workEmail' => 'jane@acme.com',
                'mobilePhone' => '+15550001111',
            ], 200),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            ['company' => 'Acme', 'website' => 'https://acme.com'],
            [
                ['title' => 'Jane Doe', 'snippet' => 'CEO at Acme.', 'url' => 'https://acme.com'],
            ],
        );

        $this->assertSame('jane@acme.com', $result['email']);
        $this->assertSame('+15550001111', $result['phone']);
        $this->assertSame('tier2', $result['tier']);
        $this->assertSame('bytemine', $result['provider']);
    }

    public function test_falls_back_to_apollo_after_tier2_miss(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => 'cl-test',
            'services.cleanlist.base_url' => 'https://cleanlist.example.com/v1',
            'services.apollo.api_key' => 'apollo-test',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'bytemine.example.com/v1/people/enrich' => Http::response(['matched' => false], 200),
            'cleanlist.example.com/v1/people/enrich' => Http::response(['matched' => false], 200),
            'api.apollo.io/v1/mixed_people/search' => Http::response([
                'people' => [[
                    'title' => 'CEO',
                    'organization_name' => 'Acme',
                    'email' => 'jane@acme.com',
                    'phone_numbers' => [['sanitized_number' => '+15550002222']],
                    'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
                ]],
            ], 200),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            ['company' => 'Acme'],
            [
                ['title' => 'Jane Doe', 'snippet' => 'Leader at Acme', 'url' => 'https://example.com'],
            ],
        );

        $this->assertSame('jane@acme.com', $result['email']);
        $this->assertSame('+15550002222', $result['phone']);
        $this->assertSame('tier3', $result['tier']);
        $this->assertSame('apollo', $result['provider']);
    }

    public function test_skips_paid_providers_when_linkedin_profile_already_present(): void
    {
        config([
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => 'apollo-key',
            'services.hunter.api_key' => 'hunter-key',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'api.apollo.io/*' => Http::response(['people' => []], 200),
            'api.hunter.io/*' => Http::response(['data' => []], 200),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            [
                'company' => 'Acme',
                'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
            ],
            [],
        );

        $this->assertSame('https://www.linkedin.com/in/janedoe', $result['linkedin_url']);
        Http::assertNotSent(fn($request) => str_contains($request->url(), 'api.apollo.io'));
        Http::assertNotSent(fn($request) => str_contains($request->url(), 'api.hunter.io'));
    }
}
