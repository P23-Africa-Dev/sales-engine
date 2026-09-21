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

    public function test_target_detection_matrix(): void
    {
        $cases = [
            ['Generate leads relevant to my ICP', QueryIntentService::TARGET_BOTH],
            ['business prospects in fintech', QueryIntentService::TARGET_BOTH],
            ['generate new prospects', QueryIntentService::TARGET_BOTH],
            ['FinTech companies in Lagos', QueryIntentService::TARGET_COMPANIES],
            ['enterprise accounts in Kenya', QueryIntentService::TARGET_COMPANIES],
            ['CEOs at FinTech startups', QueryIntentService::TARGET_PEOPLE],
            ['founders of SaaS companies', QueryIntentService::TARGET_PEOPLE],
            ['decision makers in payments', QueryIntentService::TARGET_PEOPLE],
            ['companies and their founders', QueryIntentService::TARGET_BOTH],
            ['accounts and contacts in Lagos', QueryIntentService::TARGET_BOTH],
            ['both people and companies in fintech', QueryIntentService::TARGET_BOTH],
            ['partnership contacts at fintech startups in Lagos', QueryIntentService::TARGET_PEOPLE],
            ['give me prospects', QueryIntentService::TARGET_BOTH],
            ['Generate 20 more leads', QueryIntentService::TARGET_BOTH],
        ];

        foreach ($cases as [$query, $expected]) {
            $result = $this->service->analyze($query, 'generate_leads');
            $this->assertSame($expected, $result['target'], "Failed for: {$query}");
        }
    }

    public function test_ambiguous_generate_defaults_to_both(): void
    {
        $result = $this->service->analyze('Generate 50 new leads', 'generate_leads');

        $this->assertSame(QueryIntentService::TARGET_BOTH, $result['target']);
    }

    public function test_looks_like_content_or_generic_phrase(): void
    {
        $this->assertTrue($this->service->looksLikeContentOrGenericPhrase('11 Tips to Generate Sales Leads'));
        $this->assertTrue($this->service->looksLikeContentOrGenericPhrase('How I Find 100 Qualified Leads'));
        $this->assertTrue($this->service->looksLikeArticleTitle('Matching Requirement'));
        $this->assertFalse($this->service->looksLikeContentOrGenericPhrase('Acme Distributors'));
    }

    public function test_strips_prospect_count_instruction(): void
    {
        $raw = 'I need leads of the top richest people in the world (Find 100 prospects unless a different number is specified.)';
        $this->assertSame(
            'I need leads of the top richest people in the world',
            $this->service->stripProspectCountInstruction($raw)
        );
    }

    public function test_detects_generic_lead_requests(): void
    {
        $this->assertTrue($this->service->isGenericLeadRequest('Generate leads relevant to me'));
        $this->assertTrue($this->service->isGenericLeadRequest(
            'Generate leads relevant to my ICP (Find 100 prospects unless a different number is specified.)'
        ));
        $this->assertTrue($this->service->isGenericLeadRequest('generate new prospects'));
        $this->assertFalse($this->service->isGenericLeadRequest('I need leads of the top richest people in the world'));
        $this->assertFalse($this->service->isGenericLeadRequest('FMCG distributors in Lagos'));
    }
}
