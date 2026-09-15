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
        $this->assertStringContainsString('6 months', $queries);
    }
}
