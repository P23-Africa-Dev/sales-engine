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
}
