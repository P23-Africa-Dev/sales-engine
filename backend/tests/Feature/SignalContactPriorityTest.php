<?php

namespace Tests\Feature;

use App\Http\Resources\SocialSignalResource;
use App\Jobs\EnrichSocialSignalJob;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Models\SocialSignal;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use App\Services\Intent\SignalToLeadService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Mockery\MockInterface;
use Tests\TestCase;

/**
 * Phase 4: one best contact per event signal — named person, then target role, then the company.
 */
class SignalContactPriorityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.hunter.api_key' => '',
            'services.contact_finder.verify_emails' => true,
        ]);
        Http::preventStrayRequests();
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function signal(Organization $organization, array $attributes = []): SocialSignal
    {
        $icp = IcpProfile::query()->create([
            'organization_id' => $organization->id,
            'name' => 'Fintech',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), ['decisionMakers' => ['CTO']]),
        ]);

        return SocialSignal::query()->create(array_merge([
            'organization_id' => $organization->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://news.example.com/acme-'.uniqid(),
            'content_hash' => 'hash-'.uniqid(),
            'platform' => 'news',
            'source_label' => 'News',
            'source_icon' => 'news',
            'post_text' => 'Acme Corp opens a Nairobi office.',
            'company_name' => 'Acme Corp',
            'entity_type' => 'company',
            'location_text' => 'Nairobi, Kenya',
            'signal_type' => 'market_signal',
            'signal_type_key' => 'new_market_entry',
            'score' => 80,
            'status' => 'new',
            'meta' => ['icp_status' => 'qualified'],
        ], $attributes));
    }

    /**
     * @param  callable(MockInterface): void  $expectations
     */
    private function mockOrchestrator(callable $expectations): void
    {
        // Partial: emailStatusFor() keeps its real rules.
        $this->partialMock(ContactEnrichmentOrchestrator::class, $expectations);
    }

    private function enrichSignal(SocialSignal $signal): SocialSignal
    {
        (new EnrichSocialSignalJob($signal->id))->handle(app(SignalToLeadService::class));

        return $signal->fresh();
    }

    public function test_the_person_named_in_the_event_is_the_contact(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, [
            'signal_type_key' => 'leadership_hire_in_territory',
            'named_people' => ['Tamara Cook'],
            'company_name' => 'FSD Kenya',
        ]);

        $this->mock(LeadProfileEnrichmentService::class, fn ($mock) => $mock->shouldReceive('enrichCompanyDecisionMaker')->never());
        $this->mockOrchestrator(function ($mock) {
            $mock->shouldReceive('enrichContacts')->once()
                ->withArgs(fn ($org, string $person, array $seed) => $person === 'Tamara Cook' && $seed['company'] === 'FSD Kenya')
                ->andReturn([
                    'email' => 'tamara.cook@fsdkenya.org', 'phone' => '', 'linkedin_url' => 'https://www.linkedin.com/in/tamara-cook',
                    'title' => 'Chief Executive Officer', 'company_email' => 'info@fsdkenya.org', 'company_phone' => '',
                    'contact_sources' => ['email' => [
                        'value' => 'tamara.cook@fsdkenya.org', 'type' => 'direct', 'method' => 'website_crawl',
                        'source_url' => 'https://fsdkenya.org/team', 'confidence' => 'on_page',
                    ]],
                ]);
        });

        $signal = $this->enrichSignal($signal);

        $this->assertSame('enriched', $signal->meta['contact_status']);
        $this->assertSame([
            'name' => 'Tamara Cook',
            'role' => 'Chief Executive Officer',
            'email' => 'tamara.cook@fsdkenya.org',
            'email_status' => 'found_on_website',
            'phone' => null,
            'linkedin_url' => 'https://www.linkedin.com/in/tamara-cook',
            'source_url' => 'https://fsdkenya.org/team',
            'confidence' => 'on_page',
        ], $signal->meta['contact']);
        $this->assertSame('qualified', $signal->meta['icp_status']);
        $this->assertSame(SocialSignal::ENRICHMENT_ATTEMPTED_FOUND, $signal->enrichment_status);
    }

    public function test_target_role_lookup_is_used_when_nobody_is_named(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall')->with(true)->once()->ordered();
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()->ordered()
                ->withArgs(fn ($org, $icp, string $company, IcpBrief $brief) => $company === 'Acme Corp' && $brief->decisionMakers === ['CTO'])
                ->andReturn([
                    'company' => 'Acme Corp', 'contact_person' => 'Ada Obi', 'title' => 'CTO',
                    'linkedin_url' => 'https://www.linkedin.com/in/ada-obi',
                ]);
            $mock->shouldReceive('setDeferContactWaterfall')->with(false)->once()->ordered();
        });
        $this->mockOrchestrator(function ($mock) {
            $mock->shouldReceive('enrichContacts')->once()
                ->withArgs(fn ($org, string $person) => $person === 'Ada Obi')
                ->andReturn([
                    'email' => 'ada@acme.com', 'phone' => '', 'title' => '', 'linkedin_url' => '',
                    'contact_sources' => ['email' => ['value' => 'ada@acme.com', 'type' => 'direct', 'method' => 'pattern_inference', 'source_url' => null, 'confidence' => 'pattern']],
                ]);
        });

        $contact = $this->enrichSignal($signal)->meta['contact'];

        $this->assertSame('Ada Obi', $contact['name']);
        $this->assertSame('CTO', $contact['role']);
        $this->assertSame('ada@acme.com', $contact['email']);
        $this->assertSame('likely', $contact['email_status']);
        $this->assertSame('https://www.linkedin.com/in/ada-obi', $contact['linkedin_url']);
    }

    public function test_signal_type_target_roles_override_the_icp_roles(): void
    {
        [, $org] = $this->actingAsOrgMember();
        SignalTypeDefinition::query()->create([
            'organization_id' => $org->id, 'key' => 'new_market_entry', 'label' => 'New market entry',
            'trigger_description' => 'Company enters a new country.', 'target_roles' => ['Country Manager', 'Head of Expansion'],
        ]);
        $signal = $this->signal($org);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall');
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()
                ->withArgs(fn ($org, $icp, string $company, IcpBrief $brief) => $brief->decisionMakers === ['Country Manager', 'Head of Expansion'])
                ->andReturn(['company' => 'Acme Corp']);
        });
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn(['email' => '', 'phone' => '', 'contact_sources' => []]));

        $this->assertSame('no_contact_found', $this->enrichSignal($signal)->meta['contact_status']);
    }

    public function test_company_inbox_and_phone_when_no_person_is_found(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall');
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()->andReturn(['company' => 'Acme Corp', 'enrichment_attempted' => true]);
        });
        $this->mockOrchestrator(function ($mock) {
            $mock->shouldReceive('enrichContacts')->once()
                ->withArgs(fn ($org, string $person) => $person === '')
                ->andReturn([
                    'email' => 'info@acme.co.ke', 'phone' => '+254700000001', 'company_email' => 'info@acme.co.ke', 'company_phone' => '+254700000001',
                    'contact_sources' => [
                        'company_email' => ['value' => 'info@acme.co.ke', 'type' => 'generic', 'method' => 'serper_search', 'source_url' => 'https://acme.co.ke/contact', 'confidence' => 'snippet'],
                        'company_phone' => ['value' => '+254700000001', 'type' => 'company_line', 'method' => 'serper_search', 'source_url' => 'https://acme.co.ke/contact', 'confidence' => 'snippet'],
                    ],
                ]);
        });

        $signal = $this->enrichSignal($signal);

        $this->assertSame('company_only', $signal->meta['contact_status']);
        $this->assertNull($signal->meta['contact']['name']);
        $this->assertNull($signal->meta['contact']['role']);
        $this->assertSame('info@acme.co.ke', $signal->meta['contact']['email']);
        $this->assertSame('search_result', $signal->meta['contact']['email_status']);
        $this->assertSame('+254700000001', $signal->meta['contact']['phone']);
    }

    public function test_no_contact_found_when_nothing_turns_up(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall');
            $mock->shouldReceive('enrichCompanyDecisionMaker')->andReturn(['company' => 'Acme Corp']);
        });
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn([
            'email' => '', 'phone' => '', 'company_email' => '', 'company_phone' => '', 'contact_sources' => [],
        ]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('no_contact_found', $signal->meta['contact_status']);
        $this->assertNull($signal->meta['contact']);
        $this->assertSame(SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND, $signal->enrichment_status);
    }

    public function test_the_appointees_role_is_read_from_the_event(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, [
            'signal_type_key' => 'leadership_hire_in_territory',
            'company_name' => 'Lactalis Botswana',
            'named_people' => ['Cyril Clement'],
            'summary' => 'Lactalis Botswana appointed Cyril Clement as Country Manager. His leadership is expected to grow the business.',
        ]);

        $this->mock(LeadProfileEnrichmentService::class, fn ($mock) => $mock->shouldReceive('enrichCompanyDecisionMaker')->never());
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn([
            'email' => '', 'phone' => '', 'title' => '', 'linkedin_url' => 'https://www.linkedin.com/in/cyril-clement',
            'company_email' => '', 'company_phone' => '', 'contact_sources' => [],
        ]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('Cyril Clement', $signal->meta['contact']['name']);
        $this->assertSame('Country Manager', $signal->meta['contact']['role']);
    }

    public function test_a_role_search_match_without_a_stated_role_is_not_the_contact(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, ['company_name' => 'JPMorgan']);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall');
            // Live case: a name next to the company, but nothing said what they do there.
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()->andReturn(['company' => 'JPMorgan', 'contact_person' => 'Manuj Bawa', 'title' => '']);
        });
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()
            ->withArgs(fn ($org, string $person) => $person === '')
            ->andReturn(['email' => '', 'phone' => '', 'company_email' => 'info@jpmorgan.example', 'company_phone' => '', 'contact_sources' => [
                'company_email' => ['value' => 'info@jpmorgan.example', 'type' => 'generic', 'method' => 'website_crawl', 'source_url' => 'https://jpmorgan.example/contact', 'confidence' => 'on_page'],
            ]]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('company_only', $signal->meta['contact_status']);
        $this->assertNull($signal->meta['contact']['name']);
    }

    public function test_the_news_outlet_or_journalist_is_never_the_contact(): void
    {
        [, $org] = $this->actingAsOrgMember();
        // Live acceptance case: a JPMorgan story published by "Tech Labari" made the outlet the contact.
        $signal = $this->signal($org, [
            'company_name' => 'JPMorgan',
            'profile_name' => 'Tech Labari',
            'persona' => 'News/media outlet',
            'source_label' => 'News · Tech Labari',
            'named_people' => ['Engineering News', 'Tech Labari'],
            'meta' => ['icp_status' => 'partial', 'author_name' => 'Tech Labari'],
        ]);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall');
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()->andReturn(['company' => 'JPMorgan']);
        });
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()
            ->withArgs(fn ($org, string $person) => $person === '')
            ->andReturn(['email' => '', 'phone' => '', 'company_email' => '', 'company_phone' => '', 'contact_sources' => []]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('no_contact_found', $signal->meta['contact_status']);
        $this->assertNull($signal->meta['contact']);
    }

    public function test_a_named_persons_company_switchboard_is_not_their_own_phone(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, ['named_people' => ['Jane Doe']]);

        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn([
            'email' => '', 'phone' => '+254700000001', 'company_email' => '', 'company_phone' => '+254700000001',
            'contact_sources' => [
                'phone' => ['value' => '+254700000001', 'type' => 'company_line', 'method' => 'website_crawl', 'source_url' => 'https://acme.co.ke/contact', 'confidence' => 'on_page'],
                'company_phone' => ['value' => '+254700000001', 'type' => 'company_line', 'method' => 'website_crawl', 'source_url' => 'https://acme.co.ke/contact', 'confidence' => 'on_page'],
            ],
        ]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('company_only', $signal->meta['contact_status']);
        $this->assertSame('Jane Doe', $signal->meta['contact']['name']);
        $this->assertNull($signal->meta['contact']['role']);
        $this->assertSame('+254700000001', $signal->meta['contact']['phone']);
    }

    public function test_hunter_checks_the_contact_email_with_the_key_in_a_header(): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key']);
        Http::fake(['api.hunter.io/*' => Http::response(['data' => ['status' => 'valid', 'result' => 'deliverable']])]);
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, ['named_people' => ['Jane Doe']]);

        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn([
            'email' => 'jane.doe@acme.com', 'phone' => '',
            'contact_sources' => ['email' => ['value' => 'jane.doe@acme.com', 'type' => 'direct', 'method' => 'serper_search', 'source_url' => 'https://contactout.com/jane-doe', 'confidence' => 'snippet']],
        ]));

        $contact = $this->enrichSignal($signal)->meta['contact'];

        $this->assertSame('verified', $contact['email_status']);
        Http::assertSent(fn (Request $request) => str_starts_with($request->url(), 'https://api.hunter.io/v2/email-verifier')
            && $request->header('X-API-KEY') === ['test-hunter-key']
            && ! str_contains($request->url(), 'test-hunter-key'));
        $this->assertDatabaseHas('enrichment_logs', ['social_signal_id' => $signal->id, 'provider' => 'hunter_verifier', 'found_email' => 1]);
    }

    public function test_an_email_hunter_calls_invalid_is_dropped_and_the_status_recalculated(): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key']);
        Http::fake(['api.hunter.io/*' => Http::response(['data' => ['status' => 'invalid']])]);
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, ['named_people' => ['Jane Doe']]);

        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->once()->andReturn([
            'email' => 'jane.doe@acme.com', 'phone' => '', 'company_email' => '', 'company_phone' => '+254700000001',
            'contact_sources' => ['email' => ['value' => 'jane.doe@acme.com', 'type' => 'direct', 'method' => 'pattern_inference', 'source_url' => null, 'confidence' => 'pattern']],
        ]));

        $signal = $this->enrichSignal($signal);

        $this->assertSame('company_only', $signal->meta['contact_status']);
        $this->assertNull($signal->meta['contact']['email']);
        $this->assertNull($signal->meta['contact']['email_status']);
        $this->assertSame('+254700000001', $signal->meta['contact']['phone']);
    }

    public function test_verification_is_skipped_without_a_hunter_key_or_when_switched_off(): void
    {
        Http::fake();
        [, $org] = $this->actingAsOrgMember();
        $result = [
            'email' => 'jane.doe@acme.com', 'phone' => '',
            'contact_sources' => ['email' => ['value' => 'jane.doe@acme.com', 'type' => 'direct', 'method' => 'website_crawl', 'source_url' => 'https://acme.com/team', 'confidence' => 'on_page']],
        ];
        $this->mockOrchestrator(fn ($mock) => $mock->shouldReceive('enrichContacts')->andReturn($result));

        $withoutKey = $this->enrichSignal($this->signal($org, ['named_people' => ['Jane Doe']]));

        config(['services.hunter.api_key' => 'test-hunter-key', 'services.contact_finder.verify_emails' => false]);
        $switchedOff = $this->enrichSignal($this->signal($org, ['named_people' => ['Jane Doe']]));

        Http::assertNothingSent();
        $this->assertSame('found_on_website', $withoutKey->meta['contact']['email_status']);
        $this->assertSame('found_on_website', $switchedOff->meta['contact']['email_status']);
    }

    public function test_resource_exposes_the_contact(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $signal = $this->signal($org, ['meta' => [
            'contact_status' => 'enriched',
            'contact' => ['name' => 'Jane Doe', 'role' => null, 'email' => 'jane@acme.com', 'email_status' => 'verified', 'phone' => null, 'linkedin_url' => null, 'source_url' => null, 'confidence' => 'on_page'],
        ]]);

        $data = (new SocialSignalResource($signal))->toArray(request());

        $this->assertSame('enriched', $data['contactStatus']);
        $this->assertSame('jane@acme.com', $data['contact']['email']);
        $this->assertArrayHasKey('icpStatus', $data);
    }
}
