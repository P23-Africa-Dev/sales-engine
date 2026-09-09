<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\QueryIntentService;
use Tests\TestCase;

class QueryIntentServiceDefaultLimitTest extends TestCase
{
    public function test_count_free_generate_leads_defaults_to_40(): void
    {
        $service = new QueryIntentService;

        $this->assertSame(40, QueryIntentService::DEFAULT_LEAD_LIMIT);
        $this->assertSame(40, $service->analyze('Find SaaS founders in Lagos', 'generate_leads')['limit']);
        $this->assertSame(40, $service->analyze('prospects matching my ICP', 'generate_leads')['limit']);
    }

    public function test_explicit_count_still_parsed(): void
    {
        $service = new QueryIntentService;

        $this->assertSame(20, $service->analyze('Find 20 leads in FinTech', 'generate_leads')['limit']);
        $this->assertSame(50, $service->analyze('give me 50 SaaS companies', 'generate_leads')['limit']);
    }
}
