<?php

namespace Tests\Unit;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Scoring\ScoringService;
use Tests\TestCase;

class ScoringServiceTest extends TestCase
{
    public function test_heuristic_score_includes_icp_relevance_reason(): void
    {
        config(['services.glm.api_key' => '']);

        $org = Organization::query()->create([
            'name' => 'Test Org',
            'slug' => 'test-org-scoring-' . uniqid(),
        ]);

        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech', 'SaaS'],
                'territories' => ['Lagos, NG'],
                'decisionMakers' => ['Head of Sales'],
                'minMatchScore' => 60,
            ]),
        ]), 'FMCG distributors Lagos');

        $scores = app(ScoringService::class)->score([
            'name' => 'Acme Distributors Lagos',
            'summary' => 'Leading FMCG distributor in Lagos.',
            'sector' => 'FMCG',
            'location' => 'Lagos, NG',
        ], $brief, $org);

        $this->assertArrayHasKey('icp_relevance_reason', $scores);
        $this->assertNotSame('', trim($scores['icp_relevance_reason']));
        $this->assertStringContainsString('FinTech', $scores['icp_relevance_reason']);
        $this->assertStringNotContainsString('Fits your', $scores['icp_relevance_reason']);
    }

    public function test_factual_query_reason_differs_when_below_threshold(): void
    {
        config(['services.glm.api_key' => '']);

        $org = Organization::query()->create([
            'name' => 'Test Org',
            'slug' => 'test-org-factual-' . uniqid(),
        ]);

        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
                'minMatchScore' => 95,
            ]),
        ]), 'top 10 wealthiest men in the world');

        $this->assertTrue($brief->isAuthoritativePeopleQuery());

        $scores = app(ScoringService::class)->score([
            'name' => 'Elon Musk',
            'summary' => 'CEO of Tesla and SpaceX.',
            'authoritative_source' => true,
        ], $brief, $org);

        $this->assertStringContainsString("doesn't match", mb_strtolower($scores['icp_relevance_reason']));
        $this->assertStringContainsString('FinTech', $scores['icp_relevance_reason']);
    }

    public function test_build_icp_relevance_reason_for_strong_fit(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS'],
                'territories' => ['Nairobi'],
                'decisionMakers' => ['CEO'],
                'minMatchScore' => 50,
            ]),
        ]), 'SaaS companies Nairobi');

        $reason = app(ScoringService::class)->buildIcpRelevanceReason($brief, 80.0, false, [
            'name' => 'Acme SaaS',
            'industry' => 'SaaS',
            'location' => 'Nairobi',
        ]);

        $this->assertStringContainsString('SaaS', $reason);
        $this->assertStringContainsString('Nairobi', $reason);
        $this->assertStringContainsString('CEO', $reason);
        $this->assertStringContainsString('Fits your', $reason);
    }

    public function test_unknown_firmographics_do_not_claim_icp_fit(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['SaaS'],
                'territories' => ['Nairobi'],
                'minMatchScore' => 60,
            ]),
        ]), 'generate leads');

        $scores = app(ScoringService::class)->heuristicScore([
            'name' => 'Mystery Co',
            'summary' => 'A company with no firmographic fields.',
        ], $brief);

        $this->assertLessThan(60, $scores['icp_fit_score']);
        $this->assertStringContainsString('not verified', mb_strtolower($scores['icp_relevance_reason']));
        $this->assertStringNotContainsString('Fits your', $scores['icp_relevance_reason']);
    }

    public function test_industry_match_alone_does_not_verify_fit_or_claim_territory(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'Lagos FinTech',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Financial Services'],
                'territories' => ['Lagos, NG'],
                'customPrompt' => 'fintech companies expanding into emerging markets',
                'minMatchScore' => 60,
            ]),
        ]), 'generate leads');

        $payload = [
            'name' => 'Global Bank Holdings',
            'industry' => 'Financial Services',
        ];

        $fit = app(ScoringService::class)->assessFirmographicFit($payload, $brief);
        $this->assertFalse($fit['verified_match']);
        $this->assertFalse($fit['territory_verified']);

        $scores = app(ScoringService::class)->heuristicScore($payload, $brief);
        $this->assertLessThan(60, $scores['icp_fit_score']);
        $this->assertStringNotContainsString('in Lagos', $scores['icp_relevance_reason']);
        $this->assertStringContainsString('not confirmed', mb_strtolower($scores['icp_relevance_reason']));
    }

    public function test_brief_words_lift_a_relevant_lead_above_a_brand_name_match(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'Lagos FinTech',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Financial Services'],
                'territories' => ['Lagos, NG'],
                'customPrompt' => 'fintech payment companies expanding into emerging markets',
                'minMatchScore' => 60,
            ]),
        ]), 'generate leads');

        $scoring = app(ScoringService::class);

        $relevant = $scoring->heuristicScore([
            'name' => 'NovaPay',
            'industry' => 'Financial Services',
            'location' => 'Lagos, NG',
            'summary' => 'Fintech payment rails for merchants expanding into emerging markets.',
        ], $brief);

        $brandOnly = $scoring->heuristicScore([
            'name' => 'Global Bank Holdings',
            'industry' => 'Financial Services',
        ], $brief);

        $this->assertGreaterThan($brandOnly['priority_score'], $relevant['priority_score']);
        $this->assertGreaterThanOrEqual(60, $relevant['icp_fit_score']);
    }

    public function test_brief_noun_overlap_preferred_in_relevance_reason(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'UK',
            'description' => 'earthmoving plant-hire dealers',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Manufacturing'],
                'territories' => ['england'],
                'customPrompt' => 'companies in construction, earthmoving, and heavy equipment',
                'minMatchScore' => 50,
            ]),
        ]), 'generate leads');

        $reason = app(ScoringService::class)->buildIcpRelevanceReason($brief, 80.0, false, [
            'name' => 'Midlands Earthmoving Ltd',
            'industry' => 'Manufacturing',
            'location' => 'england',
            'summary' => 'Heavy equipment and earthmoving hire.',
        ]);

        $this->assertStringContainsString('Matches your search for', $reason);
        $this->assertStringContainsString('earthmoving', mb_strtolower($reason));
    }
}
