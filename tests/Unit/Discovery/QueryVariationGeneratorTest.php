<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\QueryIntentService;
use App\Services\Discovery\QueryVariationGenerator;
use Tests\TestCase;

class QueryVariationGeneratorTest extends TestCase
{
    private function brief(array $overrides = []): IcpBrief
    {
        return new IcpBrief(
            name: $overrides['name'] ?? 'SaaS ICP',
            description: '',
            industries: $overrides['industries'] ?? ['SaaS', 'Fintech', 'HealthTech'],
            territories: $overrides['territories'] ?? ['United States', 'Canada', 'United Kingdom'],
            companySizes: [],
            decisionMakers: $overrides['decisionMakers'] ?? ['CEO', 'CTO', 'VP Sales'],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: $overrides['query'] ?? 'SaaS CTOs in North America',
            target: $overrides['target'] ?? 'people',
            requestedLimit: $overrides['requestedLimit'] ?? 50,
        );
    }

    public function test_generate_returns_multiple_unique_queries_capped_by_budget(): void
    {
        $generator = new QueryVariationGenerator;
        $queries = $generator->generate($this->brief(), 50);

        $this->assertGreaterThanOrEqual(3, count($queries));
        $this->assertLessThanOrEqual(QueryVariationGenerator::MAX_QUERIES, count($queries));
        $this->assertSame(count($queries), count(array_unique(array_map('mb_strtolower', $queries))));
        $this->assertStringContainsString('SaaS', $queries[0]);
    }

    public function test_query_budget_scales_with_target_and_caps_at_max(): void
    {
        $generator = new QueryVariationGenerator;

        $this->assertSame(3, $generator->queryBudget(10));
        $this->assertSame(7, $generator->queryBudget(50));
        $this->assertSame(QueryVariationGenerator::MAX_QUERIES, $generator->queryBudget(200));
    }

    public function test_icp_only_request_permutes_industries_and_titles(): void
    {
        $generator = new QueryVariationGenerator;
        $queries = $generator->generate($this->brief([
            'query' => 'generate leads for my icp',
        ]), 40);

        $joined = mb_strtolower(implode(' | ', $queries));
        $this->assertStringContainsString('saas', $joined);
        $this->assertTrue(
            str_contains($joined, 'ceo') || str_contains($joined, 'cto') || str_contains($joined, 'vp sales'),
            'Expected decision-maker titles in ICP fan-out queries'
        );
    }

    public function test_people_variations_include_linkedin_site_filter(): void
    {
        $generator = new QueryVariationGenerator;
        $queries = $generator->generate($this->brief(['target' => 'people']), 30);

        $withLinkedIn = array_filter(
            $queries,
            fn(string $q): bool => str_contains(mb_strtolower($q), 'linkedin.com/in')
        );

        $this->assertNotEmpty($withLinkedIn);
    }
}

class QueryIntentLimitTest extends TestCase
{
    public function test_parse_limit_defaults_and_clamps(): void
    {
        $service = new QueryIntentService;

        $this->assertSame(20, $service->analyze('', 'generate_leads')['limit']);
        $this->assertSame(10, $service->analyze('', 'quick_research')['limit']);
        $this->assertSame(50, $service->analyze('find 50 saas ctos', 'generate_leads')['limit']);
        $this->assertSame(100, $service->analyze('I need 100 prospects in lagos', 'generate_leads')['limit']);
        $this->assertSame(150, $service->analyze('find 999 leads', 'generate_leads')['limit']);
    }

    public function test_strip_preserves_limit_when_parsed_from_raw_prefix(): void
    {
        $service = new QueryIntentService;
        $raw = 'Find 75 leads. SaaS founders in Kenya';

        $this->assertSame(75, $service->analyze($raw, 'generate_leads')['limit']);
        $this->assertSame('SaaS founders in Kenya', $service->stripProspectCountInstruction($raw));
    }
}
