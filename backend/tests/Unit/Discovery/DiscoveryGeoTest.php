<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\QueryIntentService;
use Tests\TestCase;

class DiscoveryGeoTest extends TestCase
{
    public function test_nigeria_and_lagos_ng_resolve_to_nigeria_gl(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief(['territories' => ['Lagos, NG']]);

        $this->assertSame('Nigeria', $geo->primaryLabel($brief));
        $params = $geo->serperParams($brief);
        $this->assertSame('ng', $params['gl'] ?? null);
        $this->assertStringContainsString('Nigeria', (string) ($params['location'] ?? ''));
    }

    public function test_england_lowercase_resolves_uk_gl(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief(['territories' => ['england']]);

        $this->assertSame('England', $geo->primaryLabel($brief));
        $this->assertSame('uk', $geo->serperParams($brief)['gl'] ?? null);
        $hq = $geo->hunterHeadquarters($brief);
        $this->assertNotEmpty($hq);
        $this->assertSame('GB', $hq[0]['country'] ?? null);
    }

    public function test_empty_territories_leave_query_and_serper_untouched(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief(['territories' => []]);

        $this->assertSame([], $geo->serperParams($brief));
        $this->assertSame([], $geo->hunterHeadquarters($brief));
        $this->assertSame('logistics companies', $geo->appendTerritoryClause($brief, 'logistics companies'));
    }

    public function test_append_territory_clause_does_not_duplicate_nigeria(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief([
            'territories' => ['Nigeria'],
            'customPrompt' => '3PL operators in Nigeria',
            'query' => '',
        ]);

        $this->assertSame(
            '3PL operators in Nigeria',
            $geo->appendTerritoryClause($brief, '3PL operators in Nigeria')
        );
        $this->assertSame(
            'logistics 3PL Nigeria',
            $geo->appendTerritoryClause($brief, 'logistics 3PL')
        );
    }

    public function test_user_named_different_country(): void
    {
        $geo = new DiscoveryGeo;

        $this->assertFalse($geo->userNamedDifferentCountry($this->brief([
            'territories' => ['Nigeria'],
            'query' => 'logistics companies',
        ])));
        $this->assertTrue($geo->userNamedDifferentCountry($this->brief([
            'territories' => ['Nigeria'],
            'query' => 'companies in India',
        ])));
        $this->assertFalse($geo->userNamedDifferentCountry($this->brief([
            'territories' => ['Nigeria'],
            'query' => 'Lagos 3PL',
        ])));
    }

    public function test_should_apply_retrieval_geo_skips_authoritative_people_query(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief([
            'territories' => ['Nigeria'],
            'query' => 'top 10 wealthiest men',
        ]);

        $this->assertTrue($brief->isAuthoritativePeopleQuery());
        $this->assertFalse($geo->shouldApplyRetrievalGeo($brief));
    }

    public function test_tld_ng_and_co_uk_infer_countries_not_com(): void
    {
        $geo = new DiscoveryGeo;

        $this->assertSame('Nigeria', $geo->inferLocationFromTld('https://acme.com.ng/about'));
        $this->assertSame('England', $geo->inferLocationFromTld('https://freight.co.uk/'));
        $this->assertNull($geo->inferLocationFromTld('https://acme.com/about'));
        $this->assertSame('Nigeria', $geo->inferLocationFromTld('https://ng.linkedin.com/company/kobo360'));
        $this->assertSame('England', $geo->inferLocationFromTld('https://uk.linkedin.com/in/ada'));
        $this->assertSame('Nigeria', $geo->inferLocationFromText('Visit kobo360.com.ng for freight'));
        $this->assertSame('Nigeria', $geo->inferLocationFromText('HQ country NG'));
        $this->assertSame('England', $geo->inferLocationFromText('registered in GB'));
    }

    public function test_gb_iso_resolves_england_region(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief(['territories' => ['GB']]);

        $this->assertSame('England', $geo->primaryLabel($brief));
        $this->assertSame('uk', $geo->serperParams($brief)['gl'] ?? null);
    }

    public function test_netherland_alias_and_european_cctlds(): void
    {
        $geo = new DiscoveryGeo;

        $this->assertSame('Netherlands', $geo->primaryLabel($this->brief(['territories' => ['Netherland']])));
        $this->assertSame('nl', $geo->serperParams($this->brief(['territories' => ['Netherland']]))['gl'] ?? null);
        $this->assertSame('Germany', $geo->inferLocationFromTld('https://acme.de/about'));
        $this->assertSame('Netherlands', $geo->inferLocationFromTld('https://shop.nl/'));
        $this->assertSame('Denmark', $geo->inferLocationFromTld('https://corp.dk/'));
        $this->assertSame('Sweden', $geo->inferLocationFromTld('https://ab.se/'));
    }

    public function test_selected_regions_preserve_order_across_countries(): void
    {
        $geo = new DiscoveryGeo;
        $brief = $this->brief(['territories' => ['Germany', 'Netherland', 'Denmark']]);
        $labels = $geo->selectedCountryLabels($brief);

        $this->assertSame(['Germany', 'Netherlands', 'Denmark'], $labels);
        $this->assertSame('Germany', $geo->primaryLabel($brief));
    }

    public function test_search_places_returns_catalog_matches_only(): void
    {
        $geo = new DiscoveryGeo;
        $places = $geo->searchPlaces('nether', 10);
        $labels = array_column($places, 'label');

        $this->assertTrue(
            collect($labels)->contains(fn (string $label) => str_contains(mb_strtolower($label), 'netherland')),
            'Expected Netherlands in place search'
        );
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function brief(array $overrides = []): IcpBrief
    {
        return new IcpBrief(
            name: 'Test',
            description: '',
            industries: $overrides['industries'] ?? ['Logistics'],
            territories: $overrides['territories'] ?? ['Nigeria'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: $overrides['customPrompt'] ?? 'logistics 3PL',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: $overrides['query'] ?? '',
            target: QueryIntentService::TARGET_COMPANIES,
        );
    }
}
