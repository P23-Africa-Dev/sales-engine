<?php

namespace Tests\Unit\Discovery;

use App\Models\IcpProfile;
use App\Services\Discovery\Adapters\SerperPlacesDiscoveryAdapter;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SerperPlacesDiscoveryAdapterTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.serper.api_key' => 'test-serper', 'services.serper.base_url' => 'https://google.serper.dev']);
    }

    private function brief(string $query, string $mode): IcpBrief
    {
        return IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'Lagos Logistics',
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Logistics'],
                'territories' => ['Lagos, NG'],
            ]),
        ]), $query, $mode);
    }

    public function test_maps_listings_into_located_company_hits_with_phone(): void
    {
        Http::fake([
            'google.serper.dev/places' => Http::response(['places' => [[
                'title' => 'SwiftHaul Logistics',
                'address' => '12 Admiralty Way, Lekki, Lagos, Nigeria',
                'category' => 'Logistics service',
                'phoneNumber' => '+234 803 555 0101',
                'website' => 'https://swifthaul.ng',
                'rating' => 4.6,
                'ratingCount' => 88,
                'cid' => '123',
            ]]], 200),
        ]);

        $hits = app(SerperPlacesDiscoveryAdapter::class)->search(
            $this->brief('freight forwarders in Lagos', 'companies'),
            new SearchContext(1, null, 12, 'generate_leads'),
        );

        $this->assertCount(1, $hits);
        $hit = $hits->first();
        $this->assertSame('SwiftHaul Logistics', $hit->name);
        $this->assertSame('https://swifthaul.ng', $hit->website);
        $this->assertStringContainsString('Lagos', (string) $hit->location);
        $this->assertSame('+234 803 555 0101', $hit->meta['phone']);
        Http::assertSent(fn (Request $request) => $request['q'] === 'freight forwarders in Lagos, NG');
    }

    public function test_people_searches_do_not_call_places(): void
    {
        Http::fake();

        $hits = app(SerperPlacesDiscoveryAdapter::class)->search(
            $this->brief('freight forwarders in Lagos', 'people'),
            new SearchContext(1, null, 12, 'generate_leads'),
        );

        $this->assertCount(0, $hits);
        Http::assertNothingSent();
    }
}
