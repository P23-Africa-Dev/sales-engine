<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Enrichment\ApolloPersonEnricher;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\RoleBasedContactSearch;
use App\Services\Integrations\Factory23\CrmSyncService;
use App\Services\Intent\Adapters\SerperLinkedInAdapter;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SignalToLeadService;
use App\Services\Intent\SocialSignalEnricher;
use Mockery;
use ReflectionMethod;
use Tests\TestCase;

class SignalToLeadServiceTest extends TestCase
{
    public function test_convert_creates_person_shaped_lead_with_poster_meta(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'SaaS ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['crm_destination' => 'human_review'],
        ));

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://www.linkedin.com/posts/jane-doe_activity-123',
            'content_hash' => 'hash-person-1',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Looking for a better CRM for our sales team.',
            'summary' => 'CRM evaluation signal',
            'profile_name' => 'Jane Doe',
            'author_profile_url' => 'https://www.linkedin.com/in/jane-doe',
            'persona' => 'VP Sales',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'industry' => 'SaaS',
            'location_text' => 'Lagos, NG',
            'intent_label' => 'Recommendation',
            'intent_color' => '#6ec758',
            'signal_type' => 'recommendation',
            'score' => 78,
            'status' => 'new',
            'key_topics' => ['CRM', 'sales'],
            'competitors' => ['HubSpot'],
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')->andReturn([
            'email' => 'jane@example.com',
            'phone' => '+2348012345678',
            'linkedin_url' => 'https://www.linkedin.com/in/jane-doe',
            'title' => 'VP Sales',
            'company_name' => '',
            'tier' => 'tier3',
            'provider' => 'hunter',
        ]);

        $service = new SignalToLeadService($crm, $contacts, new RoleBasedContactSearch(new ApolloPersonEnricher));
        $result = $service->convert($signal, $org, true);

        $lead = $result['lead']->fresh();
        $this->assertSame('Jane Doe', $lead->name);
        $this->assertSame('social_linkedin', $lead->source);

        $meta = $lead->meta;
        $this->assertSame($signal->id, $meta['social_signal_id']);
        $this->assertSame('VP Sales', $meta['title']);
        $this->assertSame('Lagos, NG', $meta['location']);
        $this->assertSame('https://www.linkedin.com/in/jane-doe', $meta['linkedin_url']);
        $this->assertSame('jane@example.com', $meta['email']);
        $this->assertSame('+2348012345678', $meta['phone']);
        $this->assertSame('human_review', $meta['crm_destination']);
        $this->assertContains('https://www.linkedin.com/in/jane-doe', $meta['profile_urls']);

        $signal->refresh();
        $this->assertSame($lead->id, $signal->lead_id);
        $this->assertSame('reviewed', $signal->status);
    }

    public function test_convert_uses_company_name_for_company_entity(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Retail ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://www.linkedin.com/posts/acme-corp_activity-9',
            'content_hash' => 'hash-company-1',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Acme Corp is expanding into West Africa.',
            'profile_name' => 'Acme Corp',
            'author_profile_url' => 'https://www.linkedin.com/company/acme-corp',
            'persona' => 'Corporate page',
            'company_name' => 'Acme Corp',
            'entity_type' => 'company',
            'location_text' => 'Nairobi',
            'intent_label' => 'Market Signal',
            'intent_color' => '#22c3a6',
            'signal_type' => 'market_signal',
            'score' => 66,
            'status' => 'new',
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')->andReturn([
            'email' => '',
            'phone' => '',
            'linkedin_url' => '',
            'title' => '',
            'company_name' => 'Acme Corp',
            'tier' => null,
            'provider' => null,
        ]);

        $service = new SignalToLeadService($crm, $contacts, new RoleBasedContactSearch(new ApolloPersonEnricher));
        $result = $service->convert($signal, $org, false);

        $this->assertSame('Acme Corp', $result['lead']->name);
        $this->assertSame('Acme Corp', $result['lead']->meta['company'] ?? null);
    }

    public function test_convert_is_idempotent_when_signal_already_has_lead(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $existingLead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Existing Poster',
            'source' => 'social_linkedin',
            'score' => 70,
            'summary' => 'Already converted',
            'stage' => 'new',
            'meta' => ['social_signal_id' => 1],
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/post',
            'content_hash' => 'hash-idempotent',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Already synced signal',
            'profile_name' => 'Existing Poster',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'intent_label' => 'Recommendation',
            'intent_color' => '#6ec758',
            'signal_type' => 'recommendation',
            'score' => 70,
            'status' => 'synced',
            'lead_id' => $existingLead->id,
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->once()->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')->never();

        $service = new SignalToLeadService($crm, $contacts, new RoleBasedContactSearch(new ApolloPersonEnricher));
        $result = $service->convert($signal, $org, true);

        $this->assertSame($existingLead->id, $result['lead']->id);
        $this->assertSame(1, Lead::query()->where('organization_id', $org->id)->count());
    }

    public function test_logs_an_enrichment_attempt_per_named_person_on_the_signal(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/leadership-hire',
            'content_hash' => 'hash-multi-person',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Jane Doe appointed Country Manager, replacing John Smith.',
            'company_name' => 'Acme Corp',
            'entity_type' => 'company',
            'signal_type' => 'hiring_expansion',
            'signal_type_key' => 'leadership_hire_in_territory',
            'named_people' => ['Jane Doe', 'John Smith'],
            'score' => 80,
            'status' => 'new',
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')
            ->twice()
            ->andReturnUsing(function ($org, $personName) {
                if ($personName === 'Jane Doe') {
                    return [
                        'email' => 'jane@acme.com', 'phone' => '', 'linkedin_url' => '',
                        'title' => 'Country Manager', 'company_name' => 'Acme Corp',
                        'tier' => 'tier3', 'provider' => 'apollo',
                    ];
                }

                return ['email' => '', 'phone' => '', 'linkedin_url' => '', 'title' => '', 'company_name' => '', 'tier' => null, 'provider' => null];
            });

        $roleBased = Mockery::mock(RoleBasedContactSearch::class);
        $roleBased->shouldReceive('findContact')->never();

        $service = new SignalToLeadService($crm, $contacts, $roleBased);
        $result = $service->convert($signal, $org, true);

        $lead = $result['lead']->fresh();
        $this->assertSame('jane@acme.com', $lead->meta['email']); // primary (first) named person
        $this->assertSame('apollo', $lead->meta['contact_enrichment_provider']);

        $signal->refresh();
        $this->assertSame(SocialSignal::ENRICHMENT_ATTEMPTED_FOUND, $signal->enrichment_status);
        $this->assertNotNull($signal->enrichment_attempted_at);
    }

    public function test_falls_back_to_role_based_search_when_no_person_is_named(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), ['decisionMakers' => ['Head of Sales']]),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/market-entry',
            'content_hash' => 'hash-role-based',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Acme Corp opens a new Kenyan subsidiary.',
            'company_name' => 'Acme Corp',
            'entity_type' => 'company',
            'signal_type' => 'market_signal',
            'signal_type_key' => 'new_market_entry',
            'score' => 75,
            'status' => 'new',
            // no profile_name, no named_people — nobody named in this signal.
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')->never();

        $roleBased = Mockery::mock(RoleBasedContactSearch::class);
        $roleBased->shouldReceive('findContact')
            ->once()
            ->with($org, 'Acme Corp', ['Head of Sales'], Mockery::type('int'), $signal->id)
            ->andReturn(['email' => 'hos@acme.com', 'matched_role' => 'Head of Sales']);

        $service = new SignalToLeadService($crm, $contacts, $roleBased);
        $result = $service->convert($signal, $org, true);

        $lead = $result['lead']->fresh();
        $this->assertSame('hos@acme.com', $lead->meta['email']);
        $this->assertSame('role_based_search', $lead->meta['contact_enrichment_provider']);

        $signal->refresh();
        $this->assertSame(SocialSignal::ENRICHMENT_ATTEMPTED_FOUND, $signal->enrichment_status);
    }

    public function test_enrichment_status_stays_not_attempted_when_nothing_can_be_enriched(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/no-target',
            'content_hash' => 'hash-no-target',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'A post with no identifiable person or company.',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'signal_type' => 'other',
            'score' => 50,
            'status' => 'new',
            // profile_name blank, no named_people, no real company — nothing to enrich.
        ]);

        $crm = Mockery::mock(CrmSyncService::class);
        $crm->shouldReceive('canSync')->andReturn(false);

        $contacts = Mockery::mock(ContactEnrichmentOrchestrator::class);
        $contacts->shouldReceive('enrichContacts')->never();

        $roleBased = Mockery::mock(RoleBasedContactSearch::class);
        $roleBased->shouldReceive('findContact')->never();

        $service = new SignalToLeadService($crm, $contacts, $roleBased);
        $service->convert($signal, $org, true);

        $signal->refresh();
        $this->assertSame(SocialSignal::ENRICHMENT_NOT_ATTEMPTED, $signal->enrichment_status);
        $this->assertNull($signal->enrichment_attempted_at);
    }
}

class AuthorProfileExtractionTest extends TestCase
{
    public function test_linkedin_adapter_extracts_author_profile_from_post_url(): void
    {
        $adapter = new SerperLinkedInAdapter;
        $method = new ReflectionMethod(SerperLinkedInAdapter::class, 'extractAuthor');
        $method->setAccessible(true);

        $result = $method->invoke(
            $adapter,
            'https://www.linkedin.com/posts/ada-lovelace_activity-123456',
            'Ada Lovelace on LinkedIn: Hiring engineers',
            'We are hiring...'
        );

        $this->assertSame('Ada Lovelace', $result['name']);
        $this->assertSame('https://www.linkedin.com/in/ada-lovelace', $result['profile_url']);
    }

    public function test_enricher_preserves_author_profile_url_in_heuristic_path(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn Post',
            sourceIcon: 'in',
            postText: 'Looking for vendors',
            postUrl: 'https://www.linkedin.com/posts/sam-smith_activity-1',
            snippet: 'Looking for vendors',
            title: 'Sam Smith on LinkedIn',
            authorName: 'Sam Smith',
            authorProfileUrl: 'https://www.linkedin.com/in/sam-smith',
        );

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertSame('Sam Smith', $enriched['profile_name']);
        $this->assertSame('https://www.linkedin.com/in/sam-smith', $enriched['author_profile_url']);
    }
}
