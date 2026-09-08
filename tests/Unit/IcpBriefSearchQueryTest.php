<?php

namespace Tests\Unit;

use App\Models\IcpProfile;
use App\Services\Discovery\DTO\IcpBrief;
use Tests\TestCase;

class IcpBriefSearchQueryTest extends TestCase
{
    public function test_factual_ranking_query_uses_authoritative_sources(): void
    {
        $profile = new IcpProfile([
            'name' => 'Test ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'top 10 wealthiest men in the world');
        $query = $brief->searchQuery();

        $this->assertStringContainsString('Forbes', $query);
        $this->assertStringContainsString('Bloomberg', $query);
        $this->assertStringNotContainsString('linkedin.com', $query);
    }

    public function test_standard_people_query_keeps_linkedin_bias(): void
    {
        $profile = new IcpProfile([
            'name' => 'Test ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'partnership contacts at fintech startups in Lagos');
        $query = $brief->searchQuery();

        $this->assertStringContainsString('linkedin.com', $query);
    }

    public function test_generic_icp_request_falls_back_to_icp_industries_and_territories(): void
    {
        $profile = new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech', 'SaaS'],
                'territories' => ['Lagos, NG', 'Nairobi'],
                'decisionMakers' => ['Head of Sales', 'CEO'],
            ]),
        ]);

        $brief = IcpBrief::fromIcpProfile(
            $profile,
            'Generate leads relevant to my ICP (Find 100 prospects unless a different number is specified.)'
        );

        $this->assertFalse($brief->hasUserQuery());
        $query = $brief->searchQuery();

        $this->assertStringContainsString('FinTech', $query);
        $this->assertStringContainsString('Lagos', $query);
        $this->assertStringNotContainsString('Find 100 prospects', $query);
        $this->assertStringNotContainsString('relevant to my ICP', $query);
    }

    public function test_strips_find_n_wrapper_but_keeps_substantive_query(): void
    {
        $profile = new IcpProfile([
            'name' => 'Test ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $brief = IcpBrief::fromIcpProfile(
            $profile,
            'I need leads of the top richest people in the world (Find 100 prospects unless a different number is specified.)'
        );

        $this->assertTrue($brief->hasUserQuery());
        $this->assertTrue($brief->isAuthoritativePeopleQuery());
        $this->assertStringNotContainsString('Find 100 prospects', $brief->query);
        $this->assertStringContainsString('Forbes', $brief->searchQuery());
    }
}
