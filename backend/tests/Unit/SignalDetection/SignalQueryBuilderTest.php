<?php

namespace Tests\Unit\SignalDetection;

use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\SignalDetection\SignalQueryBuilder;
use Tests\TestCase;

class SignalQueryBuilderTest extends TestCase
{
    public function test_does_not_include_structured_icp_fields(): void
    {
        $type = new SignalTypeDefinition([
            'key' => 'new_market_entry',
            'label' => 'New Market Entry',
            'trigger_description' => 'Company announces opening an office or subsidiary in a new territory.',
            'pack' => SignalTypeDefinition::PACK_DEFAULT,
            'default_recency_window_days' => 180,
        ]);

        $brief = new IcpBrief(
            name: 'ICP',
            description: 'Watch for expansion news',
            industries: ['FMCG & Retail UNIQUE_INDUSTRY_TOKEN'],
            territories: ['Lagos, NG UNIQUE_TERRITORY_TOKEN'],
            companySizes: ['51-200'],
            decisionMakers: ['Head of Procurement UNIQUE_ROLE_TOKEN'],
            customPrompt: 'office openings',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );

        $queries = implode(' ', (new SignalQueryBuilder)->buildQueriesForType($type, $brief));

        $this->assertStringNotContainsString('UNIQUE_INDUSTRY_TOKEN', $queries);
        $this->assertStringNotContainsString('UNIQUE_TERRITORY_TOKEN', $queries);
        $this->assertStringNotContainsString('UNIQUE_ROLE_TOKEN', $queries);
        $this->assertStringNotContainsString('51-200', $queries);
        $this->assertStringContainsString('New Market Entry', $queries);
        $this->assertStringContainsString('office openings', $queries);
        $this->assertStringNotContainsString('6 months', $queries);
    }

    public function test_trigger_snippet_does_not_end_on_a_dangling_word(): void
    {
        $type = new SignalTypeDefinition([
            'key' => 'new_market_entry',
            'label' => 'New Market Entry',
            'trigger_description' => 'Company announces opening an office, subsidiary, warehouse, or plant in a new territory.',
            'pack' => SignalTypeDefinition::PACK_DEFAULT,
            'default_recency_window_days' => 180,
        ]);

        $brief = new IcpBrief(
            name: 'ICP',
            description: '',
            industries: [],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );

        $queries = (new SignalQueryBuilder)->buildQueriesForType($type, $brief);

        $this->assertSame(['New Market Entry Company announces opening an office, subsidiary, warehouse'], $queries);
    }

    public function test_news_queries_describe_the_company_event_in_the_icp_territories(): void
    {
        $type = new SignalTypeDefinition(['key' => 'distribution_partnership_announcement', 'label' => 'Distribution/Partnership Announcement', 'pack' => SignalTypeDefinition::PACK_DEFAULT]);
        $brief = new IcpBrief(
            name: 'ICP',
            description: '',
            industries: ['Industrial Manufacturing'],
            territories: ['Kenya', 'Nigeria', 'Ghana'],
            companySizes: [],
            decisionMakers: ['Export Director'],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );

        $queries = (new SignalQueryBuilder)->buildEventQueries($type, $brief);

        $this->assertSame([
            'Industrial Manufacturing appoints distributor in Kenya',
            'Industrial Manufacturing partnership agreement Kenya distributor',
            'Industrial Manufacturing appoints distributor in Nigeria',
        ], $queries);
    }

    public function test_hiring_queries_use_the_target_role(): void
    {
        $type = new SignalTypeDefinition(['key' => 'hiring_job_post', 'label' => 'Hiring / Job Post', 'pack' => SignalTypeDefinition::PACK_DEFAULT]);
        $brief = new IcpBrief(name: 'ICP', description: '', industries: ['Logistics'], territories: ['Lagos'], companySizes: [], decisionMakers: ['Head of Sales'], customPrompt: '', minMatchScore: 60, autoSyncCrm: false, query: '');

        $this->assertSame(['Logistics Lagos hiring', 'Head of Sales Logistics Lagos'], (new SignalQueryBuilder)->buildEventQueries($type, $brief));
    }

    public function test_based_in_location_adds_one_phrasing(): void
    {
        $type = new SignalTypeDefinition(['key' => 'new_market_entry', 'label' => 'New Market Entry', 'pack' => SignalTypeDefinition::PACK_DEFAULT]);
        $brief = new IcpBrief(name: 'ICP', description: '', industries: ['Industrial Manufacturing'], territories: ['Kenya'], companySizes: [], decisionMakers: [], customPrompt: '', minMatchScore: 60, autoSyncCrm: false, query: '', companyLocations: ['Germany']);

        $this->assertContains('Germany Industrial Manufacturing opens subsidiary in Kenya', (new SignalQueryBuilder)->buildEventQueries($type, $brief));
    }

    public function test_home_market_press_is_searched_in_its_own_language(): void
    {
        $type = new SignalTypeDefinition(['key' => 'new_market_entry', 'label' => 'New Market Entry', 'pack' => SignalTypeDefinition::PACK_DEFAULT]);
        $brief = new IcpBrief(name: 'ICP', description: '', industries: [], territories: ['Kenya', 'Africa'], companySizes: [], decisionMakers: [], customPrompt: '', minMatchScore: 60, autoSyncCrm: false, query: '', companyLocations: ['Germany', 'Netherlands', 'Austria', 'Brazil']);

        $queries = (new SignalQueryBuilder)->buildLocalizedEventQueries($type, $brief);

        $this->assertContains(['q' => 'Hersteller gründet Tochtergesellschaft in Kenia', 'gl' => 'de', 'hl' => 'de'], $queries);
        $this->assertContains(['q' => 'Hersteller gründet Tochtergesellschaft in Afrika', 'gl' => 'de', 'hl' => 'de'], $queries);
        $this->assertContains(['q' => 'opent vestiging in Kenia', 'gl' => 'nl', 'hl' => 'nl'], $queries);
        // One set per language (Austria shares German); unsupported countries add nothing.
        $this->assertCount(6, $queries);
        $this->assertSame([], (new SignalQueryBuilder)->buildLocalizedEventQueries($type, new IcpBrief(name: 'X', description: '', industries: [], territories: ['Kenya'], companySizes: [], decisionMakers: [], customPrompt: '', minMatchScore: 60, autoSyncCrm: false, query: '')));
    }
}
