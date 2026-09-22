<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Geography as a retrieval constraint (Serper location/gl, Hunter HQ, query clause)
 * and as the shared country catalog for gate/override checks.
 *
 * Industry, size, revenue, and roles stay out of search text. Territory is the
 * explicit exception: locate the search, then fail-closed on other countries.
 */
final class DiscoveryGeo
{
    /**
     * @var list<array{
     *     label: string,
     *     gl: string,
     *     hunterCountry: string,
     *     aliases: list<string>,
     *     cities: array<string, string>
     * }>
     */
    private const REGIONS = [
        [
            'label' => 'Nigeria',
            'gl' => 'ng',
            'hunterCountry' => 'NG',
            'aliases' => ['nigeria', 'naija'],
            'cities' => [
                'lagos' => 'Lagos',
                'abuja' => 'Abuja',
                'kano' => 'Kano',
                'port harcourt' => 'Port Harcourt',
                'ibadan' => 'Ibadan',
            ],
        ],
        [
            'label' => 'England',
            'gl' => 'uk',
            'hunterCountry' => 'GB',
            'aliases' => ['england', 'united kingdom', 'britain', 'great britain', 'u.k.', 'uk', 'gb'],
            'cities' => [
                'london' => 'London',
                'manchester' => 'Manchester',
                'birmingham' => 'Birmingham',
                'leeds' => 'Leeds',
                'bristol' => 'Bristol',
                'liverpool' => 'Liverpool',
                'sheffield' => 'Sheffield',
            ],
        ],
        [
            'label' => 'Kenya',
            'gl' => 'ke',
            'hunterCountry' => 'KE',
            'aliases' => ['kenya'],
            'cities' => [
                'nairobi' => 'Nairobi',
                'mombasa' => 'Mombasa',
            ],
        ],
        [
            'label' => 'Ghana',
            'gl' => 'gh',
            'hunterCountry' => 'GH',
            'aliases' => ['ghana'],
            'cities' => [
                'accra' => 'Accra',
            ],
        ],
        [
            'label' => 'South Africa',
            'gl' => 'za',
            'hunterCountry' => 'ZA',
            'aliases' => ['south africa'],
            'cities' => [
                'johannesburg' => 'Johannesburg',
                'cape town' => 'Cape Town',
                'durban' => 'Durban',
            ],
        ],
        [
            'label' => 'Egypt',
            'gl' => 'eg',
            'hunterCountry' => 'EG',
            'aliases' => ['egypt'],
            'cities' => [
                'cairo' => 'Cairo',
            ],
        ],
        [
            'label' => 'United States',
            'gl' => 'us',
            'hunterCountry' => 'US',
            'aliases' => ['united states', 'usa', 'u.s.', 'u.s.a.', 'america'],
            'cities' => [
                'new york' => 'New York',
                'san francisco' => 'San Francisco',
            ],
        ],
        [
            'label' => 'India',
            'gl' => 'in',
            'hunterCountry' => 'IN',
            'aliases' => ['india', 'bharat'],
            'cities' => [
                'mumbai' => 'Mumbai',
                'delhi' => 'Delhi',
                'bangalore' => 'Bangalore',
                'bengaluru' => 'Bengaluru',
                'hyderabad' => 'Hyderabad',
                'chennai' => 'Chennai',
                'pune' => 'Pune',
                'kolkata' => 'Kolkata',
            ],
        ],
    ];

    public function primaryLabel(IcpBrief $brief): string
    {
        $region = $this->resolveRegion($brief);
        if ($region !== null) {
            return $region['label'];
        }

        $first = trim((string) ($brief->territories[0] ?? ''));
        if ($first === '') {
            return '';
        }

        $segment = trim(explode(',', $first)[0]);

        return $segment !== '' ? $segment : $first;
    }

    /**
     * @return list<string>
     */
    public function countryTokens(IcpBrief $brief): array
    {
        $region = $this->resolveRegion($brief);
        if ($region === null) {
            $label = $this->primaryLabel($brief);

            return $label !== '' ? [mb_strtolower($label)] : [];
        }

        $tokens = array_merge(
            [mb_strtolower($region['label']), $region['gl'], mb_strtolower($region['hunterCountry'])],
            $region['aliases'],
            array_keys($region['cities']),
        );

        return array_values(array_unique($tokens));
    }

    /**
     * @return array{location?: string, gl?: string}
     */
    public function serperParams(IcpBrief $brief): array
    {
        if ($brief->territories === []) {
            return [];
        }

        $region = $this->resolveRegion($brief);
        if ($region === null) {
            $fallback = $this->primaryLabel($brief);

            return $fallback !== '' ? ['location' => $fallback] : [];
        }

        $city = $this->firstCityFromTerritories($brief, $region);
        $location = $city !== null
            ? $city.', '.$region['label']
            : $region['label'];

        return [
            'location' => $location,
            'gl' => $region['gl'],
        ];
    }

    /**
     * @return list<array<string, string>>
     */
    public function hunterHeadquarters(IcpBrief $brief): array
    {
        if ($brief->territories === []) {
            return [];
        }

        $region = $this->resolveRegion($brief);
        if ($region === null) {
            return [];
        }

        $city = $this->firstCityFromTerritories($brief, $region);
        if ($city !== null) {
            return [[
                'city' => $city,
                'country' => $region['hunterCountry'],
            ]];
        }

        return [['country' => $region['hunterCountry']]];
    }

    public function appendTerritoryClause(IcpBrief $brief, string $query): string
    {
        $query = trim($query);
        if (
            $query === ''
            || $brief->hasUserQuery()
            || $brief->isAuthoritativePeopleQuery()
            || $brief->territories === []
        ) {
            return $query;
        }

        $label = $this->primaryLabel($brief);
        if ($label === '') {
            return $query;
        }

        if (preg_match('/\b'.preg_quote($label, '/').'\b/iu', $query)) {
            return $query;
        }

        return trim($query.' '.$label);
    }

    public function userNamedDifferentCountry(IcpBrief $brief): bool
    {
        $named = $this->regionKeysInText($brief->query);
        if ($named === []) {
            return false;
        }

        $icpKeys = $this->regionKeysFromTerritories($brief->territories);
        if ($icpKeys === []) {
            return false;
        }

        foreach ($named as $key) {
            if (! in_array($key, $icpKeys, true)) {
                return true;
            }
        }

        return false;
    }

    public function shouldApplyRetrievalGeo(IcpBrief $brief): bool
    {
        if ($brief->territories === []) {
            return false;
        }

        if ($brief->isAuthoritativePeopleQuery()) {
            return false;
        }

        if ($brief->hasUserQuery() && $this->userNamedDifferentCountry($brief)) {
            return false;
        }

        return true;
    }

    public function inferLocationFromText(string $haystack): ?string
    {
        $haystack = mb_strtolower(trim($haystack));
        if ($haystack === '') {
            return null;
        }

        $fromTld = $this->inferLocationFromTld($haystack);
        if ($fromTld !== null) {
            return $fromTld;
        }

        foreach (self::REGIONS as $region) {
            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b'.preg_quote($cityKey, '/').'\b/u', $haystack)) {
                    return $cityLabel.', '.$region['label'];
                }
            }
            $iso = mb_strtolower($region['hunterCountry']);
            // Match HQ codes like NG/GB; skip US/IN which collide with English words.
            if (
                ! in_array($iso, ['us', 'in'], true)
                && preg_match('/\b'.preg_quote($iso, '/').'\b/u', $haystack)
            ) {
                return $region['label'];
            }
            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b'.preg_quote($alias, '/').'\b/u', $haystack)) {
                    return $region['label'];
                }
            }
        }

        return null;
    }

    /**
     * Country from a ccTLD on a URL/domain. Never treat .com as a country.
     */
    public function inferLocationFromTld(string $haystack): ?string
    {
        $haystack = mb_strtolower(trim($haystack));
        if ($haystack === '') {
            return null;
        }

        if (preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.co\.uk(?:[\/:?#\s]|$)/u', $haystack)
            || preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.uk(?:[\/:?#\s]|$)/u', $haystack)
        ) {
            return 'England';
        }

        if (preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.ng(?:[\/:?#\s]|$)/u', $haystack)) {
            return 'Nigeria';
        }

        return null;
    }

    /**
     * Tokens that must not appear in an ICP search brief (countries, cities, ISO aliases).
     *
     * @return list<string>
     */
    public function geoStopTokens(): array
    {
        $skip = ['in', 'us', 'or', 'and', 'the', 'to'];
        $tokens = [];
        foreach (self::REGIONS as $region) {
            $candidates = array_merge(
                [mb_strtolower($region['label']), mb_strtolower($region['gl']), mb_strtolower($region['hunterCountry'])],
                $region['aliases'],
                array_keys($region['cities']),
                array_map(static fn (string $label): string => mb_strtolower($label), array_values($region['cities'])),
            );
            foreach ($candidates as $token) {
                $token = trim((string) $token);
                if ($token === '' || mb_strlen($token) < 3 || in_array($token, $skip, true)) {
                    continue;
                }
                $tokens[$token] = $token;
            }
        }

        return array_values($tokens);
    }

    /**
     * @return array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null
     */
    private function resolveRegion(IcpBrief $brief): ?array
    {
        foreach ($brief->territories as $territory) {
            $region = $this->regionFromValue((string) $territory);
            if ($region !== null) {
                return $region;
            }
        }

        return null;
    }

    /**
     * @param  array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}  $region
     */
    private function firstCityFromTerritories(IcpBrief $brief, array $region): ?string
    {
        $haystack = mb_strtolower(implode(' ', $brief->territories));
        foreach ($region['cities'] as $cityKey => $cityLabel) {
            if (preg_match('/\b'.preg_quote($cityKey, '/').'\b/u', $haystack)) {
                return $cityLabel;
            }
        }

        return null;
    }

    /**
     * @return array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null
     */
    private function regionFromValue(string $value): ?array
    {
        $normalized = mb_strtolower(trim($value));
        if ($normalized === '') {
            return null;
        }

        $iso = $this->isoCodeFromValue($normalized);

        foreach (self::REGIONS as $region) {
            if ($iso !== null && ($iso === $region['gl'] || $iso === mb_strtolower($region['hunterCountry']))) {
                return $region;
            }

            if (preg_match('/\b'.preg_quote(mb_strtolower($region['label']), '/').'\b/u', $normalized)) {
                return $region;
            }

            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b'.preg_quote($alias, '/').'\b/u', $normalized)) {
                    return $region;
                }
            }

            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b'.preg_quote($cityKey, '/').'\b/u', $normalized)) {
                    return $region;
                }
            }
        }

        return null;
    }

    private function isoCodeFromValue(string $normalized): ?string
    {
        if (preg_match('/(?:^|,\s*)([a-z]{2})(?:\s*$)/u', $normalized, $matches)) {
            return $matches[1];
        }

        if (preg_match('/^[a-z]{2}$/u', $normalized)) {
            return $normalized;
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function regionKeysInText(string $text): array
    {
        $lower = mb_strtolower($text);
        if (trim($lower) === '') {
            return [];
        }

        $found = [];
        foreach (self::REGIONS as $region) {
            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b'.preg_quote($alias, '/').'\b/u', $lower)) {
                    $found[$region['gl']] = $region['gl'];
                    break;
                }
            }
            if (isset($found[$region['gl']])) {
                continue;
            }
            if (preg_match('/\b'.preg_quote(mb_strtolower($region['label']), '/').'\b/u', $lower)) {
                $found[$region['gl']] = $region['gl'];

                continue;
            }
            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b'.preg_quote($cityKey, '/').'\b/u', $lower)) {
                    $found[$region['gl']] = $region['gl'];
                    break;
                }
            }
        }

        return array_values($found);
    }

    /**
     * @param  list<string>  $territories
     * @return list<string>
     */
    private function regionKeysFromTerritories(array $territories): array
    {
        $found = [];
        foreach ($territories as $territory) {
            $region = $this->regionFromValue((string) $territory);
            if ($region !== null) {
                $found[$region['gl']] = $region['gl'];
            }
        }

        return array_values($found);
    }
}
