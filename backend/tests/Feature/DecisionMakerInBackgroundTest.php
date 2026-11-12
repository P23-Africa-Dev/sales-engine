<?php

namespace Tests\Feature;

use App\Jobs\EnrichLeadContactsJob;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use Tests\TestCase;

/**
 * The company decision maker is found after results are shown, not inside the search.
 */
class DecisionMakerInBackgroundTest extends TestCase
{
    public function test_company_lead_gets_its_decision_maker_and_their_contacts_in_the_background(): void
    {
        config(['services.contact_finder.concurrency_driver' => 'sync']);
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id, 'name' => 'Fintech', 'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), ['decisionMakers' => ['CTO']]),
        ]);
        $lead = Lead::query()->create([
            'organization_id' => $org->id, 'icp_profile_id' => $icp->id, 'name' => 'PayOnUs',
            'stage' => 'new', 'save_status' => 'draft', 'score' => 90,
            'meta' => ['entity_type' => 'company', 'lead_type' => 'business', 'location' => 'Lagos, Nigeria', 'contact_status' => 'searching'],
        ]);

        $this->mock(LeadProfileEnrichmentService::class, function ($mock) {
            $mock->shouldReceive('setDeferContactWaterfall')->with(true);
            $mock->shouldReceive('enrichCompanyDecisionMaker')->once()->andReturn([
                'company' => 'PayOnUs', 'contact_person' => 'Ada Obi', 'title' => 'CTO',
            ]);
        });
        $this->mock(ContactEnrichmentOrchestrator::class, function ($mock) {
            $mock->shouldReceive('enrichContacts')->once()
                ->withArgs(fn ($org, string $person) => $person === 'Ada Obi')
                ->andReturn(['email' => 'ada@payonus.com', 'phone' => '', 'contact_sources' => []]);
        });

        (new EnrichLeadContactsJob($org->id, [$lead->id]))->handle();

        $meta = $lead->fresh()->meta;
        $this->assertSame('Ada Obi', $meta['contact_person']);
        $this->assertSame('CTO', $meta['title']);
        $this->assertSame('ada@payonus.com', $meta['email']);
        $this->assertSame('found', $meta['contact_status']);
    }
}
