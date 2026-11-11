<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\WebsiteContactCrawler;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteContactCrawlerTest extends TestCase
{
    public function test_extracts_contacts_from_homepage_and_linked_pages(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response("User-agent: *\nDisallow: /admin", 200),
            'https://acme.com/' => Http::response($this->homepageHtml(), 200, ['Content-Type' => 'text/html; charset=utf-8']),
            'https://acme.com/contact-us' => Http::response(
                '<html><body><p>Phone: +44 (0)20 7946 0018</p><p>Write to sales [at] acme [dot] com</p>'
                .'<a href="https://wa.me/447700900123">WhatsApp</a>'
                .'<span class="__cf_email__" data-cfemail="'.$this->cloudflareEncode('press@acme.com').'">[email protected]</span></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://acme.com/about/leadership' => Http::response(
                '<html><body><ul><li><h4>Mary Johnson</h4><p>Chief Financial Officer</p><p>Tel: +1 415 555 0199</p></li></ul></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
        ]);

        $crawl = app(WebsiteContactCrawler::class)->crawl('https://www.acme.com/');

        $emails = array_column($crawl['emails'], 'value');
        $this->assertContains('hello@acme.com', $emails);
        $this->assertContains('ceo@acme.com', $emails);
        $this->assertContains('sales@acme.com', $emails);
        $this->assertContains('press@acme.com', $emails);
        $this->assertNotContains('logo@2x.png', $emails);

        $phones = array_column($crawl['phones'], 'value');
        $this->assertSame('+1 (415) 555-0100', $phones[0]);
        $this->assertContains('+44 (0)20 7946 0018', $phones);
        $this->assertSame([['value' => '+447700900123', 'source_url' => 'https://acme.com/contact-us']], $crawl['whatsapp']);
        $this->assertSame(['1 Main St, San Francisco, US'], $crawl['addresses']);

        $people = collect($crawl['people'])->keyBy('name');
        $this->assertSame('ceo@acme.com', $people['John Smith']['email']);
        $this->assertSame('Founder & CEO', $people['John Smith']['title']);
        $this->assertSame('Chief Financial Officer', $people['Mary Johnson']['title']);
        $this->assertSame('+1 415 555 0199', $people['Mary Johnson']['phone']);

        $this->assertSame('Acme — Industrial Widgets', $crawl['profile']['title']);
        $this->assertSame('We make widgets for factories.', $crawl['profile']['description']);
        $this->assertStringContainsString('Widgets built to last', $crawl['profile']['excerpt']);
        $this->assertStringNotContainsString('trackingPixel', $crawl['profile']['excerpt']);
        $this->assertSame(3, $crawl['pages_fetched']);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/admin'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'privacy'));
    }

    public function test_respects_robots_txt_disallow_rules(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response("User-agent: *\nDisallow: /team\nAllow: /team/public", 200),
            'https://acme.com/' => Http::response(
                '<html><body><a href="/team">Team</a><a href="/team/public">Public team</a></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://acme.com/team/public' => Http::response('<html><body>Tel: 020 7946 0000</body></html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $crawl = app(WebsiteContactCrawler::class)->crawl('acme.com');

        $this->assertSame(['020 7946 0000'], array_column($crawl['phones'], 'value'));
        Http::assertNotSent(fn ($request) => $request->url() === 'https://acme.com/team');
    }

    public function test_skips_site_when_robots_disallows_everything(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response("User-agent: *\nDisallow: /", 200),
        ]);

        $crawl = app(WebsiteContactCrawler::class)->crawl('acme.com');

        $this->assertSame([], $crawl['emails']);
        $this->assertSame(0, $crawl['pages_fetched']);
        Http::assertSentCount(1);
    }

    public function test_fetch_profile_reads_homepage_only_and_caches_it(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response('', 404),
            'https://acme.com/' => Http::response($this->homepageHtml(), 200, ['Content-Type' => 'text/html']),
        ]);

        $crawler = app(WebsiteContactCrawler::class);
        $profile = $crawler->fetchProfile('acme.com');
        $crawler->fetchProfile('acme.com');

        $this->assertSame('https://acme.com/', $profile['url']);
        $this->assertSame('Acme — Industrial Widgets', $profile['title']);
        $this->assertSame('We make widgets for factories.', $profile['description']);
        Http::assertSentCount(2);
    }

    private function homepageHtml(): string
    {
        $jsonLd = json_encode([
            '@context' => 'https://schema.org',
            '@type' => 'Organization',
            'name' => 'Acme',
            'email' => 'hello@acme.com',
            'telephone' => '+1 (415) 555-0100',
            'address' => [
                '@type' => 'PostalAddress',
                'streetAddress' => '1 Main St',
                'addressLocality' => 'San Francisco',
                'addressCountry' => 'US',
            ],
            'founder' => [
                '@type' => 'Person',
                'name' => 'John Smith',
                'jobTitle' => 'Founder & CEO',
                'email' => 'mailto:ceo@acme.com',
            ],
        ]);

        return '<html><head><title>Acme — Industrial Widgets</title>'
            .'<meta name="description" content="We make widgets for factories.">'
            .'<script type="application/ld+json">'.$jsonLd.'</script>'
            .'<script>var trackingPixel = "x@y.png";</script></head><body>'
            .'<h1>Widgets built to last</h1><img src="logo@2x.png">'
            .'<a href="/contact-us">Contact us</a><a href="/about/leadership">Leadership</a>'
            .'<a href="/admin/contact">Admin contact</a><a href="/privacy">Privacy</a>'
            .'<a href="https://other.com/contact">Partner</a>'
            .'</body></html>';
    }

    private function cloudflareEncode(string $email): string
    {
        $key = 0x42;
        $encoded = sprintf('%02x', $key);
        foreach (str_split($email) as $char) {
            $encoded .= sprintf('%02x', ord($char) ^ $key);
        }

        return $encoded;
    }
}
