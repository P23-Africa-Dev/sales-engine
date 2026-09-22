<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Diversified search strings for Discovery fan-out.
 *
 * Industry, size, revenue, and roles stay out of search text. Geography is the
 * explicit exception: ICP-brief queries get a primary-country clause via DiscoveryGeo.
 */
class QueryVariationGenerator
{
    public const MAX_QUERIES = 15;

    /** Fan-out stays at 20 to limit Serper spend; limit-12 runs geo-bias the primary query instead. */
    public const FAN_OUT_THRESHOLD = 20;

    public function __construct(
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    /** @var list<string> */
    private const SIGNAL_MODIFIERS = [
        'hiring',
        'funded',
        'expanding',
        'series A OR series B',
        'partnership',
        'announcement',
        'market entry',
    ];

    /** @var list<string> */
    private const AUTHORITATIVE_LIST_HINTS = [
        'Forbes list',
        'Inc 5000',
        'Y Combinator companies',
        'Crunchbase',
    ];

    /**
     * @return list<string>
     */
    public function generate(IcpBrief $brief, int $targetCount): array
    {
        $needed = $this->queryBudget($targetCount);
        $variations = [];

        $primary = $brief->searchQuery();
        if ($primary !== '') {
            $variations[] = $this->withIcpTerritoryBias($brief, $primary);
        }

        foreach ($this->geoSplitVariations($primary !== '' ? $primary : $this->searchSeed($brief)) as $geoQuery) {
            $variations[] = $this->withIcpTerritoryBias($brief, $geoQuery);
        }

        $seed = $this->searchSeed($brief);
        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 4) as $i => $signal) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed.' '.$signal, $i % 2 === 0)
            );
        }

        if ($brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
            foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 2) as $hint) {
                $variations[] = $this->withIcpTerritoryBias($brief, trim($seed.' '.$hint));
            }
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed, true)
            );
        } else {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed.' companies', true)
            );
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed, true)
            );
            $variations[] = $this->withIcpTerritoryBias($brief, trim($seed.' site:linkedin.com/company'));
            $variations[] = $this->withIcpTerritoryBias($brief, trim('list of '.$seed));
        }

        return $this->dedupeAndCap($variations, $needed);
    }

    public function queryBudget(int $targetCount): int
    {
        $estimated = (int) ceil(max(1, $targetCount) / 5);
        // Floor 6 when targeting 20+ so geo/channel variants have room.
        $floor = $targetCount >= self::FAN_OUT_THRESHOLD ? 6 : 4;

        return min(self::MAX_QUERIES, max($floor, $estimated));
    }

    /**
     * @param  list<string>  $excludeQueries
     * @return list<string>
     */
    public function generateBackfill(IcpBrief $brief, int $targetCount, array $excludeQueries = []): array
    {
        $needed = min(self::MAX_QUERIES, max(4, (int) ceil(max(1, $targetCount) / 4)));
        $seed = $this->searchSeed($brief);
        $variations = [];

        // Company backfill: LinkedIn company pages first so fan-out stays account-oriented.
        if ($brief->isCompanySearch()) {
            $variations[] = $this->withIcpTerritoryBias($brief, trim($seed.' site:linkedin.com/company'));
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed.' companies', true)
            );
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed, true)
            );
        }

        foreach (['executives', 'founders', 'leadership team', 'decision makers', 'partnerships'] as $hint) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed.' '.$hint, false)
            );
        }

        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 5) as $i => $signal) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed.' '.$signal, $i % 2 === 0)
            );
        }

        foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 3) as $hint) {
            $variations[] = $this->withIcpTerritoryBias($brief, trim($seed.' '.$hint));
        }

        $excluded = [];
        foreach ($excludeQueries as $q) {
            $normalized = mb_strtolower(preg_replace('/\s+/u', ' ', trim((string) $q)) ?? '');
            if ($normalized !== '') {
                $excluded[$normalized] = true;
            }
        }

        $seen = $excluded;
        $out = [];
        foreach ($variations as $variation) {
            $normalized = mb_strtolower(preg_replace('/\s+/u', ' ', trim($variation)) ?? '');
            if ($normalized === '' || isset($seen[$normalized])) {
                continue;
            }
            $seen[$normalized] = true;
            $out[] = trim($variation);
            if (count($out) >= $needed) {
                break;
            }
        }

        return $out;
    }

    private function searchSeed(IcpBrief $brief): string
    {
        if ($brief->hasUserQuery()) {
            $query = trim($brief->query);

            return $query !== '' ? $query : $brief->interestSearchSeed();
        }

        return $brief->interestSearchSeed();
    }

    /**
     * ICP-brief mode only: append primary country so Serper skews to ICP geography.
     * Never rewrite a user's specific niche query.
     */
    private function withIcpTerritoryBias(IcpBrief $brief, string $query): string
    {
        return $this->discoveryGeo->appendTerritoryClause($brief, $query);
    }

    /**
     * Split multi-city prompts into per-city and country-wide variants (user query only).
     *
     * @return list<string>
     */
    private function geoSplitVariations(string $query): array
    {
        $query = trim(preg_replace('/\s+/u', ' ', $query) ?? $query);
        if ($query === '') {
            return [];
        }

        $cities = ['Lagos', 'Abuja', 'Nairobi', 'Accra', 'Kano', 'Port Harcourt', 'Ibadan', 'Johannesburg', 'Cape Town', 'Cairo'];
        $found = [];
        foreach ($cities as $city) {
            if (preg_match('/\b'.preg_quote($city, '/').'\b/iu', $query)) {
                $found[mb_strtolower($city)] = $city;
            }
        }

        if (count($found) < 2) {
            return [];
        }

        $variations = [];
        $otherCitiesPattern = implode('|', array_map(
            fn (string $c): string => preg_quote($c, '/'),
            array_values($found),
        ));

        foreach ($found as $city) {
            // Keep this city; drop the other matched cities from the phrase.
            $single = preg_replace('/\b('.$otherCitiesPattern.')\b/iu', ' ', $query) ?? $query;
            $single = preg_replace('/\s*(?:and|,|\/|&)\s*/iu', ' ', $single) ?? $single;
            $single = trim(preg_replace('/\s+/u', ' ', $single) ?? $single);
            if ($single !== '' && ! preg_match('/\b'.preg_quote($city, '/').'\b/iu', $single)) {
                $single = trim($single.' '.$city);
            }
            if ($single !== '') {
                $variations[] = $single;
            }
        }

        if (! preg_match('/\bnigeria\b/iu', $query) && $this->looksNigerianCities($found)) {
            $withoutCities = preg_replace('/\b('.$otherCitiesPattern.')\b/iu', ' ', $query) ?? $query;
            $withoutCities = preg_replace('/\s*(?:and|,|\/|&)\s*/iu', ' ', $withoutCities) ?? $withoutCities;
            $withoutCities = trim(preg_replace('/\s+/u', ' ', $withoutCities) ?? $withoutCities);
            if ($withoutCities !== '') {
                $variations[] = $withoutCities.' Nigeria';
            }
        }

        return $variations;
    }

    /**
     * @param  array<string, string>  $found
     */
    private function looksNigerianCities(array $found): bool
    {
        $ng = ['lagos', 'abuja', 'kano', 'port harcourt', 'ibadan'];
        foreach (array_keys($found) as $key) {
            if (in_array($key, $ng, true)) {
                return true;
            }
        }

        return false;
    }

    private function composePeopleOrCompany(IcpBrief $brief, string $seed, bool $preferLinkedIn = true): string
    {
        $query = trim(preg_replace('/\s+/u', ' ', $seed) ?? $seed);
        if ($query === '') {
            return '';
        }

        if ($brief->isPeopleSearch() && $preferLinkedIn) {
            return trim($query.' site:linkedin.com/in');
        }

        if ($brief->isCompanySearch() && $preferLinkedIn) {
            return trim($query.' site:linkedin.com/company');
        }

        return $query;
    }

    /**
     * @param  list<string>  $variations
     * @return list<string>
     */
    private function dedupeAndCap(array $variations, int $needed): array
    {
        $seen = [];
        $out = [];

        foreach ($variations as $variation) {
            $normalized = mb_strtolower(preg_replace('/\s+/u', ' ', trim($variation)) ?? '');
            if ($normalized === '' || isset($seen[$normalized])) {
                continue;
            }
            $seen[$normalized] = true;
            $out[] = trim($variation);
            if (count($out) >= $needed) {
                break;
            }
        }

        return $out;
    }
}
