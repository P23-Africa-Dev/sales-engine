<?php

namespace Tests\Unit;

use App\Services\Discovery\QueryIntentService;
use Tests\TestCase;

class QueryIntentServiceTest extends TestCase
{
    private QueryIntentService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QueryIntentService;
    }

    public function test_top_wealthiest_men_detected_as_people_with_limit_ten(): void
    {
        $result = $this->service->analyze('create leads for the top 10 wealthiest men', 'generate_leads');

        $this->assertSame(QueryIntentService::TARGET_PEOPLE, $result['target']);
        $this->assertSame(10, $result['limit']);
        $this->assertTrue($this->service->isListiclePeopleQuery('create leads for the top 10 wealthiest men'));
        $this->assertTrue($this->service->isFactualRankingQuery('create leads for the top 10 wealthiest men'));
    }

    public function test_all_of_these_top_ten_detected_as_factual_ranking(): void
    {
        $this->assertTrue($this->service->isFactualRankingQuery('create a lead for all of these top 10 wealthiest men'));
    }

    public function test_company_query_stays_companies(): void
    {
        $result = $this->service->analyze('FMCG distributors in Lagos', 'generate_leads');

        $this->assertSame(QueryIntentService::TARGET_COMPANIES, $result['target']);
        $this->assertFalse($this->service->isListiclePeopleQuery('FMCG distributors in Lagos'));
    }

    public function test_looks_like_content_or_generic_phrase(): void
    {
        $this->assertTrue($this->service->looksLikeContentOrGenericPhrase('11 Tips to Generate Sales Leads'));
        $this->assertTrue($this->service->looksLikeContentOrGenericPhrase('How I Find 100 Qualified Leads'));
        $this->assertTrue($this->service->looksLikeArticleTitle('Matching Requirement'));
        $this->assertFalse($this->service->looksLikeContentOrGenericPhrase('Acme Distributors'));
    }
}
