<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\WebsiteContactCrawler;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteProfilesTest extends TestCase
{
    public function test_homepages_are_read_in_one_pass_and_robots_disallow_is_respected(): void
    {
        Http::fake([
            'https://allowed.example/robots.txt' => Http::response("User-agent: *\nAllow: /", 200),
            'https://allowed.example/' => Http::response('<html><head><title>Acme Payments</title><meta name="description" content="Payment gateway for Lagos merchants"></head><body>Fintech</body></html>', 200, ['Content-Type' => 'text/html']),
            'https://blocked.example/robots.txt' => Http::response("User-agent: *\nDisallow: /", 200),
            'https://blocked.example/' => Http::response('<html><head><title>Secret</title></head></html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $profiles = app(WebsiteContactCrawler::class)->fetchProfiles(['allowed.example', 'blocked.example']);

        $this->assertSame('Acme Payments', $profiles['allowed.example']['title']);
        $this->assertStringContainsString('Payment gateway', $profiles['allowed.example']['description']);
        $this->assertSame('', $profiles['blocked.example']['title']);
    }
}
