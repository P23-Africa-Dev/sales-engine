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
        // ICP-brief mode geo-biases Serper with primary territory; personas stay out.
        $this->assertTrue(
            collect($variations)->contains(fn (string $v) => str_contains($v, 'Nigeria')),
            'Expected ICP-brief territory geo-bias in fan-out variations'
        );
        foreach ($variations as $variation) {
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

    public function test_search_brief_does_not_append_description_nouns_when_custom_prompt_is_set(): void
    {
        $profile = new IcpProfile([
            'name' => 'Niche ICP',
            'description' => 'We sell excavators and plant-hire solutions to dealers.',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing'],
                'customPrompt' => 'decision makers at companies in construction',
            ]),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'give me prospects');
        $seed = $brief->searchBrief();

        $this->assertSame('decision makers at companies in construction', $seed);
        $this->assertStringNotContainsString('excavators', $seed);
        $this->assertStringNotContainsString('Manufacturing', $seed);
    }

    public function test_search_brief_skips_definition_blurb_nouns(): void
    {
        $profile = new IcpProfile([
            'name' => 'Logistics',
            'description' => 'Industries specialize in 3PL warehousing and freight forwarding.',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'logistics 3PL e-commerce',
            ]),
        ]);

        $this->assertSame('logistics 3PL e-commerce', IcpBrief::fromIcpProfile($profile, 'give me prospects')->searchBrief());
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

    public function test_give_me_25_prospects_sets_requested_limit(): void
    {
        $profile = new IcpProfile([
            'name' => 'Test ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'give me 25 prospects');

        $this->assertFalse($brief->hasUserQuery());
        $this->assertSame(25, $brief->requestedLimit);
    }

    public function test_long_custom_prompt_is_kept_in_search_brief_and_split_into_short_queries(): void
    {
        $prompt = 'cold chain logistics providers hiring ops leads, warehouse automation vendors, or last mile delivery fleets expanding abroad';
        $profile = new IcpProfile([
            'name' => 'Niche ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => $prompt,
            ]),
        ]);

        $brief = IcpBrief::fromIcpProfile($profile, 'give me prospects');
        $this->assertSame($prompt, $brief->searchBrief());

        $queries = $brief->searchQueries();
        $this->assertGreaterThan(1, count($queries));
        foreach ($queries as $query) {
            $words = preg_split('/\s+/u', $query) ?: [];
            $this->assertLessThanOrEqual(12, count($words));
        }
        $this->assertTrue(collect($queries)->contains(fn (string $q) => str_contains(mb_strtolower($q), 'cold chain')));
        $this->assertTrue(collect($queries)->contains(fn (string $q) => str_contains(mb_strtolower($q), 'last mile')));

        $variations = app(\App\Services\Discovery\QueryVariationGenerator::class)->generate($brief, 25);
        $joined = mb_strtolower(implode(' | ', $variations));
        $this->assertStringContainsString('cold chain', $joined);
        // Fan-out is capped; later clauses may be omitted — at least one extra clause must appear.
        $this->assertTrue(
            str_contains($joined, 'warehouse') || str_contains($joined, 'last mile'),
            'Expected at least one additional brief clause in fan-out variations'
        );
    }
}
