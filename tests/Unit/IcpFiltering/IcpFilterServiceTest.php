<?php

namespace Tests\Unit\IcpFiltering;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use Tests\TestCase;

class IcpFilterServiceTest extends TestCase
{
    private function brief(array $overrides = []): IcpBrief
    {
        return new IcpBrief(
            name: $overrides['name'] ?? 'Test ICP',
            description: $overrides['description'] ?? '',
            industries: $overrides['industries'] ?? [],
            territories: $overrides['territories'] ?? [],
            companySizes: $overrides['companySizes'] ?? [],
            decisionMakers: $overrides['decisionMakers'] ?? [],
            customPrompt: $overrides['customPrompt'] ?? '',
            minMatchScore: $overrides['minMatchScore'] ?? 60,
            autoSyncCrm: false,
            query: $overrides['query'] ?? '',
            revenueRanges: $overrides['revenueRanges'] ?? [],
        );
    }

    public function test_unconstrained_icp_matches_any_candidate(): void
    {
        $result = (new IcpFilterService)->passes($this->brief(), new CandidateCompany);

        $this->assertTrue($result->passed);
        $this->assertSame(
            ['industry' => true, 'companySize' => true, 'revenue' => true, 'territory' => true],
            $result->reasons,
        );
    }

    public function test_industry_matches_case_insensitively(): void
    {
        $brief = $this->brief(['industries' => ['FMCG & Retail']]);

        $pass = (new IcpFilterService)->passes($brief, new CandidateCompany(industry: 'fmcg & retail'));
        $fail = (new IcpFilterService)->passes($brief, new CandidateCompany(industry: 'Fintech'));

        $this->assertTrue($pass->passed);
        $this->assertTrue($pass->reasons['industry']);
        $this->assertFalse($fail->passed);
        $this->assertFalse($fail->reasons['industry']);
    }

    public function test_industry_fails_closed_when_candidate_has_no_data(): void
    {
        $brief = $this->brief(['industries' => ['Fintech']]);

        $result = (new IcpFilterService)->passes($brief, new CandidateCompany(industry: null));

        $this->assertFalse($result->passed);
        $this->assertFalse($result->reasons['industry']);
    }

    public function test_company_size_matches_configured_bucket(): void
    {
        $brief = $this->brief(['companySizes' => ['51-200', '201-500']]);

        $pass = (new IcpFilterService)->passes($brief, new CandidateCompany(companySize: '51-200'));
        $fail = (new IcpFilterService)->passes($brief, new CandidateCompany(companySize: '1-10'));

        $this->assertTrue($pass->reasons['companySize']);
        $this->assertFalse($fail->reasons['companySize']);
    }

    public function test_revenue_matches_configured_range(): void
    {
        $brief = $this->brief(['revenueRanges' => ['$1M - $10M']]);

        $pass = (new IcpFilterService)->passes($brief, new CandidateCompany(revenue: '$1M - $10M'));
        $fail = (new IcpFilterService)->passes($brief, new CandidateCompany(revenue: '$100M+'));

        $this->assertTrue($pass->reasons['revenue']);
        $this->assertFalse($fail->reasons['revenue']);
    }

    public function test_territory_matches_via_token_overlap(): void
    {
        $brief = $this->brief(['territories' => ['Lagos, NG']]);

        $pass = (new IcpFilterService)->passes($brief, new CandidateCompany(territory: 'Lagos, Nigeria'));
        $fail = (new IcpFilterService)->passes($brief, new CandidateCompany(territory: 'Nairobi, Kenya'));

        $this->assertTrue($pass->reasons['territory']);
        $this->assertFalse($fail->reasons['territory']);
    }

    public function test_england_aliases_match_uk_london_and_united_kingdom(): void
    {
        $brief = $this->brief(['territories' => ['england']]);
        $filter = new IcpFilterService;

        $this->assertTrue($filter->passes($brief, new CandidateCompany(territory: 'London, UK'))->reasons['territory']);
        $this->assertTrue($filter->passes($brief, new CandidateCompany(territory: 'United Kingdom'))->reasons['territory']);
        $this->assertTrue($filter->passes($brief, new CandidateCompany(territory: 'Manchester, Britain'))->reasons['territory']);
        $this->assertFalse($filter->passes($brief, new CandidateCompany(territory: 'Lagos, Nigeria'))->reasons['territory']);
    }

    public function test_fails_overall_when_any_single_field_fails(): void
    {
        $brief = $this->brief([
            'industries' => ['Fintech'],
            'territories' => ['Lagos, NG'],
            'companySizes' => ['51-200'],
            'revenueRanges' => ['$1M - $10M'],
        ]);

        $result = (new IcpFilterService)->passes($brief, new CandidateCompany(
            industry: 'Fintech',
            companySize: '51-200',
            revenue: '$1M - $10M',
            territory: 'Nairobi, Kenya', // the one mismatched field
        ));

        $this->assertFalse($result->passed);
        $this->assertTrue($result->reasons['industry']);
        $this->assertTrue($result->reasons['companySize']);
        $this->assertTrue($result->reasons['revenue']);
        $this->assertFalse($result->reasons['territory']);
    }

    public function test_passes_overall_only_when_every_constrained_field_matches(): void
    {
        $brief = $this->brief([
            'industries' => ['Fintech'],
            'territories' => ['Lagos, NG'],
            'companySizes' => ['51-200'],
            'revenueRanges' => ['$1M - $10M'],
        ]);

        $result = (new IcpFilterService)->passes($brief, new CandidateCompany(
            industry: 'Fintech',
            companySize: '51-200',
            revenue: '$1M - $10M',
            territory: 'Lagos, NG',
        ));

        $this->assertTrue($result->passed);
    }

    public function test_unavailable_fields_are_not_evaluated_even_when_icp_constrains_them(): void
    {
        // A pipeline that can only extract industry/territory (e.g. Discovery/Social
        // Listening today — no firmographic data provider is wired in) must not
        // fail every candidate just because the ICP happens to specify a revenue
        // range or company size it structurally cannot verify.
        $brief = $this->brief([
            'industries' => ['Fintech'],
            'territories' => ['Lagos, NG'],
            'companySizes' => ['51-200'],
            'revenueRanges' => ['$1M - $10M'],
        ]);

        $result = (new IcpFilterService)->passes(
            $brief,
            new CandidateCompany(industry: 'Fintech', territory: 'Lagos, NG', companySize: null, revenue: null),
            availableFields: ['industry', 'territory'],
        );

        $this->assertTrue($result->passed);
        $this->assertTrue($result->reasons['industry']);
        $this->assertTrue($result->reasons['territory']);
        $this->assertTrue($result->reasons['companySize']); // not evaluated, not failed
        $this->assertTrue($result->reasons['revenue']);     // not evaluated, not failed
    }

    public function test_available_fields_still_fail_closed_when_unmatched(): void
    {
        $brief = $this->brief(['industries' => ['Fintech']]);

        $result = (new IcpFilterService)->passes(
            $brief,
            new CandidateCompany(industry: null),
            availableFields: ['industry'],
        );

        $this->assertFalse($result->passed);
        $this->assertFalse($result->reasons['industry']);
    }

    public function test_customprompt_and_description_never_influence_the_result(): void
    {
        // Stage 1 must never consult free-text interest fields — only the
        // structured firmographic fields. This locks that guarantee in.
        $brief = $this->brief([
            'industries' => ['Fintech'],
            'customPrompt' => 'I am actually interested in Retail companies, not Fintech',
            'description' => 'Retail-focused ICP',
        ]);

        $result = (new IcpFilterService)->passes($brief, new CandidateCompany(industry: 'Fintech'));

        $this->assertTrue($result->passed);
    }

    public function test_india_does_not_match_nigeria_via_in_token(): void
    {
        $brief = $this->brief(['territories' => ['Nigeria']]);
        $filter = new IcpFilterService;

        $this->assertFalse($filter->passes($brief, new CandidateCompany(territory: 'Pune, India'))->reasons['territory']);
        $this->assertFalse($filter->passes($brief, new CandidateCompany(territory: 'IN'))->reasons['territory']);
        $this->assertFalse($filter->passes($brief, new CandidateCompany(territory: 'India'))->reasons['territory']);
        $this->assertTrue($filter->passes($brief, new CandidateCompany(territory: 'Lagos, NG'))->reasons['territory']);
        $this->assertTrue($filter->passes($brief, new CandidateCompany(territory: 'Nigeria'))->reasons['territory']);
    }
}
