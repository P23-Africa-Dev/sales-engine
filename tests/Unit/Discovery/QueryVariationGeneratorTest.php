<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\QueryIntentService;
use App\Services\Discovery\QueryVariationGenerator;
use Tests\TestCase;

class QueryVariationGeneratorTest extends TestCase
{
    public function test_query_budget_uses_ceil_div_5_with_min_4(): void
    {
        $generator = new QueryVariationGenerator;

        $this->assertSame(4, $generator->queryBudget(10));
        $this->assertSame(6, $generator->queryBudget(20));
        $this->assertSame(10, $generator->queryBudget(50));
        $this->assertSame(15, $generator->queryBudget(150));
    }

    public function test_geo_split_produces_lagos_abuja_and_nigeria_variants(): void
    {
        $generator = new QueryVariationGenerator;
        $brief = new IcpBrief(
            name: 'Finance ICP',
            description: '',
            industries: ['FinTech'],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: 'Give me 20 Merchant cash advance and working capital lenders in Lagos and Abuja',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 20,
        );

        $queries = $generator->generate($brief, 20);
        $joined = mb_strtolower(implode("\n", $queries));

        $this->assertNotEmpty($queries);
        $this->assertGreaterThanOrEqual(6, count($queries));
        $this->assertTrue(
            str_contains($joined, 'lagos') && str_contains($joined, 'abuja'),
            'Expected geo-split variants covering Lagos and Abuja'
        );
        $this->assertStringContainsString('linkedin.com/company', $joined);
    }

    public function test_backfill_excludes_already_used_queries(): void
    {
        $generator = new QueryVariationGenerator;
        $brief = new IcpBrief(
            name: 'Tech ICP',
            description: '',
            industries: ['FinTech', 'SaaS'],
            territories: ['Lagos', 'Nairobi'],
            companySizes: [],
            decisionMakers: ['CEO', 'CTO', 'Founder', 'VP Sales'],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: 'FinTech founders',
            target: QueryIntentService::TARGET_PEOPLE,
            requestedLimit: 40,
        );

        $first = $generator->generate($brief, 40);
        $this->assertNotEmpty($first);

        $backfill = $generator->generateBackfill($brief, 40, $first);
        $normalizedFirst = array_map(
            fn(string $q) => mb_strtolower(preg_replace('/\s+/u', ' ', trim($q)) ?? ''),
            $first
        );

        foreach ($backfill as $query) {
            $normalized = mb_strtolower(preg_replace('/\s+/u', ' ', trim($query)) ?? '');
            $this->assertNotContains($normalized, $normalizedFirst);
        }

        $this->assertNotEmpty($backfill);
    }

    public function test_company_generate_and_backfill_include_linkedin_company_site(): void
    {
        $generator = new QueryVariationGenerator;
        $brief = new IcpBrief(
            name: 'Tech ICP',
            description: '',
            industries: ['FinTech'],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: 'specialty component suppliers',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 20,
        );

        $joinedGenerate = mb_strtolower(implode("\n", $generator->generate($brief, 20)));
        $joinedBackfill = mb_strtolower(implode("\n", $generator->generateBackfill($brief, 20, [])));

        $this->assertStringContainsString('linkedin.com/company', $joinedGenerate);
        $this->assertStringContainsString('linkedin.com/company', $joinedBackfill);
    }

    public function test_icp_only_variations_use_industries_softly_but_never_gate_tokens(): void
    {
        $generator = new QueryVariationGenerator;
        $brief = new IcpBrief(
            name: 'Tech ICP',
            description: '',
            industries: ['ZzyxxUniqueIndustry'],
            territories: ['QqwertTerritory'],
            companySizes: ['51-200'],
            decisionMakers: ['UniqueDecisionMakerTitle'],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 40,
        );

        $queries = array_merge(
            $generator->generate($brief, 40),
            $generator->generateBackfill($brief, 40, []),
        );
        $this->assertNotEmpty($queries);

        // When interest text is empty, industries may seed the search brief.
        $this->assertTrue(
            collect($queries)->contains(fn(string $q) => str_contains($q, 'ZzyxxUniqueIndustry')),
            'Expected industry soft keywords in ICP-only search variations'
        );

        // Territory, size, and personas remain gates — never Serper tokens.
        foreach ($queries as $query) {
            $this->assertStringNotContainsString('QqwertTerritory', $query);
            $this->assertStringNotContainsString('51-200', $query);
            $this->assertStringNotContainsString('UniqueDecisionMakerTitle', $query);
        }
    }

    public function test_icp_only_variations_prefer_custom_prompt_over_industries(): void
    {
        $generator = new QueryVariationGenerator;
        $brief = new IcpBrief(
            name: 'Tech ICP',
            description: '',
            industries: ['ZzyxxUniqueIndustry'],
            territories: ['QqwertTerritory'],
            companySizes: [],
            decisionMakers: ['UniqueDecisionMakerTitle'],
            customPrompt: 'specialty niche suppliers expanding abroad',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            target: QueryIntentService::TARGET_COMPANIES,
            requestedLimit: 40,
        );

        $queries = $generator->generate($brief, 40);
        $this->assertNotEmpty($queries);

        foreach ($queries as $query) {
            $this->assertStringContainsString('specialty niche suppliers', $query);
            $this->assertStringNotContainsString('ZzyxxUniqueIndustry', $query);
            $this->assertStringNotContainsString('QqwertTerritory', $query);
            $this->assertStringNotContainsString('UniqueDecisionMakerTitle', $query);
        }
    }
}
