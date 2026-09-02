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
    }

    public function test_company_query_stays_companies(): void
    {
        $result = $this->service->analyze('FMCG distributors in Lagos', 'generate_leads');

        $this->assertSame(QueryIntentService::TARGET_COMPANIES, $result['target']);
        $this->assertFalse($this->service->isListiclePeopleQuery('FMCG distributors in Lagos'));
    }
}
