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

    public function test_standard_people_query_uses_open_web_roles_not_linkedin_only(): void
    {
        $profile = new IcpProfile([
            'name' => 'Test ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'partnership contacts at fintech startups in Lagos');
        $query = $brief->searchQuery();

        // Primary query stays open-web / free-tier friendly; LinkedIn site: bias is applied in fan-out variants.
        $this->assertStringContainsString('CEO', $query);
        $this->assertStringContainsString('founder', $query);
        $this->assertStringNotContainsString('linkedin.com', $query);
        $this->assertStringNotContainsString('("CEO"', $query);

        $variations = app(\App\Services\Discovery\QueryVariationGenerator::class)->generate($brief, 20);
        $linkedinVariants = array_filter(
            $variations,
            fn(string $q) => str_contains(mb_strtolower($q), 'linkedin.com')
        );
        $this->assertNotEmpty($linkedinVariants, 'Fan-out should still include LinkedIn profile variants');
    }

    public function test_generic_icp_request_uses_industries_when_interest_empty_but_not_gates(): void
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
        $this->assertStringContainsString('SaaS', $query);
        $this->assertStringNotContainsString('Lagos', $query);
        $this->assertStringNotContainsString('Head of Sales', $query);
        $this->assertStringNotContainsString('Find 100 prospects', $query);
        $this->assertStringNotContainsString('relevant to my ICP', $query);

        $variations = app(\App\Services\Discovery\QueryVariationGenerator::class)->generate($brief, 20);
        foreach ($variations as $variation) {
            $this->assertStringNotContainsString('Lagos', $variation);
            $this->assertStringNotContainsString('Head of Sales', $variation);
        }
    }

    public function test_search_brief_prefers_custom_prompt_over_industries(): void
    {
        $profile = new IcpProfile([
            'name' => 'Niche ICP',
            'description' => 'Profile description fallback',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing'],
                'territories' => ['england'],
                'customPrompt' => 'niche equipment buyers expanding abroad',
            ]),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'give me prospects');
        $this->assertSame('niche equipment buyers expanding abroad', $brief->searchBrief());
        $this->assertSame($brief->searchBrief(), $brief->searchQuery());
        $this->assertFalse($brief->hasUserQuery());
    }

    public function test_search_query_override_keeps_has_user_query_false_for_generic_ask(): void
    {
        $profile = new IcpProfile([
            'name' => 'Niche ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'specialty component suppliers',
            ]),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'give me prospects')
            ->withSearchQueryOverride('specialty component suppliers');

        $this->assertFalse($brief->hasUserQuery());
        $this->assertSame('specialty component suppliers', $brief->searchQuery());
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
