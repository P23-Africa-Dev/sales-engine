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
        $this->assertSame(4, $generator->queryBudget(20));
        $this->assertSame(10, $generator->queryBudget(50));
        $this->assertSame(15, $generator->queryBudget(150));
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
            fn (string $q) => mb_strtolower(preg_replace('/\s+/u', ' ', trim($q)) ?? ''),
            $first
        );

        foreach ($backfill as $query) {
            $normalized = mb_strtolower(preg_replace('/\s+/u', ' ', trim($query)) ?? '');
            $this->assertNotContains($normalized, $normalizedFirst);
        }

        $this->assertNotEmpty($backfill);
    }
}
