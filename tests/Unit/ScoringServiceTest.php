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
            'slug' => 'test-org-scoring-'.uniqid(),
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
        ], $brief, $org);

        $this->assertArrayHasKey('icp_relevance_reason', $scores);
        $this->assertNotSame('', trim($scores['icp_relevance_reason']));
        $this->assertStringContainsString('FinTech', $scores['icp_relevance_reason']);
    }

    public function test_factual_query_reason_differs_when_below_threshold(): void
    {
        config(['services.glm.api_key' => '']);

        $org = Organization::query()->create([
            'name' => 'Test Org',
            'slug' => 'test-org-factual-'.uniqid(),
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
        ]);

        $this->assertStringContainsString('SaaS', $reason);
        $this->assertStringContainsString('Nairobi', $reason);
        $this->assertStringContainsString('CEO', $reason);
    }
}
