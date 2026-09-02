<?php

namespace Tests\Unit;

use App\Services\Discovery\QueryIntentService;
use PHPUnit\Framework\TestCase;

class QueryIntentServiceTest extends TestCase
{
    private QueryIntentService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new QueryIntentService();
    }

    public function test_detects_people_query_and_limit(): void
    {
        $result = $this->service->analyze('Give me 5 important people in the tech market for partnerships');

        $this->assertSame('people', $result['target']);
        $this->assertSame(5, $result['limit']);
    }

    public function test_detects_company_query_by_default(): void
    {
        $result = $this->service->analyze('Top FMCG distributors in Lagos');

        $this->assertSame('companies', $result['target']);
    }

    public function test_rejects_listicle_urls(): void
    {
        $this->assertTrue($this->service->isListicleUrl('https://example.com/blog/top-tech-careers-2026'));
        $this->assertFalse($this->service->isListicleUrl('https://www.linkedin.com/in/jane-doe'));
    }

    public function test_detects_article_titles(): void
    {
        $this->assertTrue($this->service->looksLikeArticleTitle('Top 10 tech careers in 2026'));
        $this->assertFalse($this->service->looksLikeArticleTitle('Jane Doe'));
    }
}
