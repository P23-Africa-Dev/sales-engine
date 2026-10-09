<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Diversified search strings for Discovery fan-out.
 *
 * Entity-first: short seeds (6–12 words), LinkedIn company/people bias, capped fan-out.
 * Longer ICP briefs are split into clauses via IcpBrief::searchQueries() — never silently
 * chopped to the first 10 words. Geography is applied via DiscoveryGeo.
 */
class QueryVariationGenerator
{
    /** Hard cap — keep Serper spend bounded and queries diverse, not duplicated. */
    public const MAX_QUERIES = 12;

    /** Default generate (12) uses a light entity fan-out. */
    public const FAN_OUT_THRESHOLD = 12;

    public const MAX_SEED_WORDS = 12;

    public function __construct(
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    /** @var list<string> */
    private const SIGNAL_MODIFIERS = [
        'hiring',
        'expanding',
        'funded',
        'partnership',
    ];

    /**
     * @return list<string>
     */
    public function generate(IcpBrief $brief, int $targetCount): array
    {
        $needed = $this->queryBudget($targetCount);
        $variations = [];
        $seeds = $this->searchSeeds($brief);

        if ($seeds === []) {
            return [];
        }

        foreach ($seeds as $index => $seed) {
            if ($seed === '') {
                continue;
            }
            $seed = $this->clampSeedWords($seed);

            // First seed gets full LinkedIn + open-web treatment; extra brief clauses add open-web + LinkedIn company.
            if ($index === 0) {
                if ($brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
                    $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/in'));
                    $variations[] = $this->withIcpTerritoryBias(
                        $brief,
                        $this->composePeopleOrCompany($brief, $seed . ' founders', true)
                    );
                } else {
                    $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/company'));
                    $variations[] = $this->withIcpTerritoryBias(
                        $brief,
                        $this->composePeopleOrCompany($brief, $seed . ' companies', true)
                    );
                    if ($brief->isBothSearch()) {
                        $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/in'));
                    }
                }
                $variations[] = $this->withIcpTerritoryBias($brief, $seed);
            } else {
                $variations[] = $this->withIcpTerritoryBias($brief, $seed);
                if ($brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
                    $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/in'));
                } else {
                    $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/company'));
                }
            }
        }

        $primary = $this->clampSeedWords($seeds[0]);

        // Geo-split on the uncompressed first seed so multi-city user prompts still fan out.
        foreach ($this->geoSplitVariations($seeds[0]) as $geoQuery) {
            $variations[] = $this->withIcpTerritoryBias($brief, $this->clampSeedWords($geoQuery));
        }

        // At most two signal modifiers on the primary seed.
        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 2) as $signal) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $primary . ' ' . $signal, true)
            );
        }

        return $this->dedupeAndCap($variations, $needed);
    }

    public function queryBudget(int $targetCount): int
    {
        $estimated = (int) ceil(max(1, $targetCount) / 5);
        // Floor 6 for default 12+ so LinkedIn + open-web + geo variants fit.
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
        $seeds = $this->searchSeeds($brief);
        $seed = $seeds[0] ?? '';
        $variations = [];

        if ($seed === '') {
            return [];
        }

        if ($brief->isCompanySearch() || $brief->isBothSearch()) {
            $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/company'));
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed . ' companies', true)
            );
        }

        if ($brief->isPeopleSearch() || $brief->isBothSearch()) {
            $variations[] = $this->withIcpTerritoryBias($brief, trim($seed . ' site:linkedin.com/in'));
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed . ' founders executives', true)
            );
        }

        foreach (array_slice($seeds, 1) as $extra) {
            $variations[] = $this->withIcpTerritoryBias($brief, $extra);
        }

        foreach (['leadership team', 'decision makers', 'partnerships'] as $hint) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed . ' ' . $hint, true)
            );
        }

        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 3) as $signal) {
            $variations[] = $this->withIcpTerritoryBias(
                $brief,
                $this->composePeopleOrCompany($brief, $seed . ' ' . $signal, true)
            );
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

    /**
     * Short search seeds: ICP briefs are split into clauses; user niche queries stay as-is (capped at 12 words).
     *
     * @return list<string>
     */
    private function searchSeeds(IcpBrief $brief): array
    {
        if ($brief->hasUserQuery()) {
            $query = trim($brief->query);
            if ($query === '') {
                return $brief->searchQueries();
            }

            // Keep the full user niche text so multi-city geo-split still sees every city.
            // Individual Serper lines are clamped when composed below.
            return [$query];
        }

        return $brief->searchQueries();
    }

    /**
     * Hard word cap for a single Serper query — never silently chops a multi-clause brief.
     */
    private function clampSeedWords(string $seed, int $maxWords = self::MAX_SEED_WORDS): string
    {
        $seed = trim(preg_replace('/\s+/u', ' ', $seed) ?? $seed);
        if ($seed === '') {
            return '';
        }

        $words = preg_split('/\s+/u', $seed) ?: [];
        if (count($words) <= $maxWords) {
            return $seed;
        }

        return implode(' ', array_slice($words, 0, $maxWords));
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
            if (preg_match('/\b' . preg_quote($city, '/') . '\b/iu', $query)) {
                $found[mb_strtolower($city)] = $city;
            }
        }

        if (count($found) < 2) {
            return [];
        }

        $variations = [];
        $otherCitiesPattern = implode('|', array_map(
            fn(string $c): string => preg_quote($c, '/'),
            array_values($found),
        ));

        foreach ($found as $city) {
            $single = preg_replace('/\b(' . $otherCitiesPattern . ')\b/iu', ' ', $query) ?? $query;
            $single = preg_replace('/\s*(?:and|,|\/|&)\s*/iu', ' ', $single) ?? $single;
            $single = trim(preg_replace('/\s+/u', ' ', $single) ?? $single);
            if ($single !== '' && ! preg_match('/\b' . preg_quote($city, '/') . '\b/iu', $single)) {
                $single = trim($single . ' ' . $city);
            }
            if ($single !== '') {
                $variations[] = $single;
            }
        }

        if (! preg_match('/\bnigeria\b/iu', $query) && $this->looksNigerianCities($found)) {
            $withoutCities = preg_replace('/\b(' . $otherCitiesPattern . ')\b/iu', ' ', $query) ?? $query;
            $withoutCities = preg_replace('/\s*(?:and|,|\/|&)\s*/iu', ' ', $withoutCities) ?? $withoutCities;
            $withoutCities = trim(preg_replace('/\s+/u', ' ', $withoutCities) ?? $withoutCities);
            if ($withoutCities !== '') {
                $variations[] = $withoutCities . ' Nigeria';
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
            return trim($query . ' site:linkedin.com/in');
        }

        if ($brief->isCompanySearch() && $preferLinkedIn) {
            return trim($query . ' site:linkedin.com/company');
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
