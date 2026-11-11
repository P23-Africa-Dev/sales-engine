<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\MxRecordChecker;
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

        Http::preventStrayRequests();
        Http::fake([
            'acme.com/*' => Http::response('', 404),
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

    public function test_paid_providers_run_when_email_missing_even_with_linkedin_profile(): void
    {
        config([
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => 'apollo-key',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::preventStrayRequests();
        Http::fake([
            'api.apollo.io/v1/mixed_people/search' => Http::response([
                'people' => [['email' => 'jane@acme.com']],
            ], 200),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            [
                'company' => 'Acme',
                'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
            ],
        );

        $this->assertSame('jane@acme.com', $result['email']);
        $this->assertSame('apollo', $result['provider']);
        $this->assertSame('provider', $result['contact_sources']['email']['confidence']);
        Http::assertSent(fn ($request) => $request->url() === 'https://api.apollo.io/v1/mixed_people/search'
            && $request->header('X-Api-Key') === ['apollo-key']
            && ! array_key_exists('api_key', $request->data()));
    }

    public function test_website_crawl_fills_contacts_before_paid_providers(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => 'apollo-key',
            'services.hunter.api_key' => 'hunter-key',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::preventStrayRequests();
        Http::fake([
            'https://acme.ng/robots.txt' => Http::response('', 404),
            'https://acme.ng/' => Http::response(
                '<html><body><a href="/our-team">Our team</a><a href="tel:0803 123 4567">Call</a><a href="mailto:info@acme.ng">Email</a></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://acme.ng/our-team' => Http::response(
                '<html><body><div><h3>Jane Doe</h3><p>Chief Executive Officer</p><p>jane.doe@acme.ng</p></div></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            ['company' => 'Acme', 'website' => 'https://www.acme.ng', 'location' => 'Lagos, Nigeria'],
        );

        $this->assertSame('jane.doe@acme.ng', $result['email']);
        $this->assertSame([
            'value' => 'jane.doe@acme.ng',
            'type' => 'direct',
            'method' => 'website_crawl',
            'source_url' => 'https://acme.ng/our-team',
            'confidence' => 'on_page',
        ], $result['contact_sources']['email']);
        $this->assertSame('+2348031234567', $result['phone']);
        $this->assertSame('company_line', $result['contact_sources']['phone']['type']);
        $this->assertSame('info@acme.ng', $result['company_email']);
        $this->assertSame('Chief Executive Officer', $result['title']);
        $this->assertSame('website', $result['tier']);
        $this->assertSame('website_crawler', $result['provider']);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'bytemine.example.com')
            || str_contains($request->url(), 'api.apollo.io')
            || str_contains($request->url(), 'api.hunter.io'));
    }

    public function test_generic_mailbox_is_kept_as_company_email_not_person_email(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response('', 404),
            'https://acme.com/' => Http::response(
                '<html><body><p>Write to sales@acme.com or noreply@acme.com</p></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
        ]);

        $person = app(ContactEnrichmentOrchestrator::class)->enrichContacts($org, 'Jane Doe', ['company' => 'Acme', 'website' => 'acme.com']);
        $business = app(ContactEnrichmentOrchestrator::class)->enrichContacts($org, '', ['company' => 'Acme', 'website' => 'acme.com']);

        $this->assertSame('', $person['email']);
        $this->assertSame('sales@acme.com', $person['company_email']);
        $this->assertSame('generic', $person['contact_sources']['company_email']['type']);
        $this->assertSame('sales@acme.com', $business['email']);
        $this->assertSame('generic', $business['contact_sources']['email']['type']);
    }

    public function test_infers_email_from_domain_pattern_when_mx_exists(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();
        $this->mock(MxRecordChecker::class)->shouldReceive('hasMx')->with('acme.com')->andReturn(true);

        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response('', 404),
            'https://acme.com/' => Http::response(
                '<html><body><a href="mailto:john.smith@acme.com">John Smith</a></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts($org, 'Jane Doe', ['company' => 'Acme', 'website' => 'acme.com']);

        $this->assertSame('jane.doe@acme.com', $result['email']);
        $this->assertSame('pattern', $result['contact_sources']['email']['confidence']);
        $this->assertSame('email_pattern', $result['provider']);
    }

    public function test_skips_crawl_and_paid_tiers_when_domain_unknown_and_providers_unconfigured(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::preventStrayRequests();
        Http::fake();

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts($org, 'Jane Doe', ['company' => 'Acme Corp']);

        $this->assertSame('', $result['email']);
        $this->assertNull($result['domain']);
        $this->assertSame([], $result['contact_sources']);
        Http::assertNothingSent();
        $this->assertDatabaseHas('enrichment_logs', [
            'organization_id' => $org->id,
            'tier' => 'none',
            'provider' => 'unavailable',
        ]);
    }

    public function test_serper_contact_search_and_places_fill_contacts_without_website(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'serper-key',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::preventStrayRequests();
        Http::fake([
            'google.serper.dev/search' => function ($request) {
                $query = (string) $request['q'];
                if (str_contains($query, 'official website')) {
                    return Http::response(['organic' => [
                        ['title' => 'Acme Logistics | LinkedIn', 'link' => 'https://ng.linkedin.com/company/acme-logistics', 'snippet' => ''],
                        ['title' => 'Acme Logistics — Home', 'link' => 'https://acmelogistics.com.ng/', 'snippet' => 'Freight across Nigeria'],
                    ]]);
                }
                if (str_contains($query, '"Jane Doe" email')) {
                    return Http::response(['organic' => [
                        ['title' => 'Jane Doe - Acme Logistics', 'link' => 'https://news.example.ng/a', 'snippet' => 'Reach Jane Doe at jane [at] acmelogistics [dot] com [dot] ng'],
                    ]]);
                }

                return Http::response(['organic' => []]);
            },
            'google.serper.dev/places' => Http::response(['places' => [
                ['title' => 'Acme Logistics Ltd', 'phoneNumber' => '0803 555 0101', 'address' => '1 Marina, Lagos', 'website' => 'https://acmelogistics.com.ng', 'cid' => '123'],
            ]]),
            'https://acmelogistics.com.ng/*' => Http::response('', 404),
            'https://www.acmelogistics.com.ng/*' => Http::response('', 404),
            'http://acmelogistics.com.ng/*' => Http::response('', 404),
        ]);

        $result = app(ContactEnrichmentOrchestrator::class)->enrichContacts(
            $org,
            'Jane Doe',
            ['company' => 'Acme Logistics', 'location' => 'Nigeria'],
        );

        $this->assertSame('acmelogistics.com.ng', $result['domain']);
        $this->assertSame('jane@acmelogistics.com.ng', $result['email']);
        $this->assertSame('serper_search', $result['contact_sources']['email']['method']);
        $this->assertSame('+2348035550101', $result['phone']);
        $this->assertSame('serper_places', $result['contact_sources']['phone']['method']);
        $this->assertSame('company_line', $result['contact_sources']['phone']['type']);
        $this->assertSame('1 Marina, Lagos', $result['address']);
    }
}
