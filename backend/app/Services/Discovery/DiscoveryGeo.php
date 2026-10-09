<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Geography as a retrieval constraint (Serper location/gl, Hunter HQ, query clause)
 * and as the shared country catalog for gate/override checks.
 *
 * Industry, size, revenue, and roles stay out of search text. Territory is the
 * explicit exception: locate the search, then fail-closed on other countries.
 * Every selected country gets its own retrieval pass — a later catalog country
 * must not replace an earlier one.
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
     * }>|null
     */
    private static ?array $regionsCache = null;

    /**
     * @return list<array{
     *     label: string,
     *     gl: string,
     *     hunterCountry: string,
     *     aliases: list<string>,
     *     cities: array<string, string>
     * }>
     */
    public function regions(): array
    {
        if (self::$regionsCache !== null) {
            return self::$regionsCache;
        }

        $path = __DIR__ . '/data/geo-regions.php';
        $loaded = is_file($path) ? require $path : [];
        if (! is_array($loaded) || $loaded === []) {
            throw new \RuntimeException('Discovery geo catalog missing or empty at ' . $path);
        }

        /** @var list<array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}> $loaded */
        self::$regionsCache = array_values($loaded);

        return self::$regionsCache;
    }

    /**
     * Clear static cache (tests).
     */
    public static function clearCache(): void
    {
        self::$regionsCache = null;
    }

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
     * Unique catalog countries from ICP territories, in selection order.
     *
     * @return list<array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}>
     */
    public function selectedRegions(IcpBrief $brief): array
    {
        $out = [];
        $seen = [];
        foreach ($brief->territories as $territory) {
            $region = $this->regionFromValue((string) $territory);
            if ($region === null) {
                continue;
            }
            $key = $region['gl'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $region;
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    public function selectedCountryLabels(IcpBrief $brief): array
    {
        return array_values(array_map(
            static fn(array $region): string => $region['label'],
            $this->selectedRegions($brief),
        ));
    }

    /**
     * @return list<string>
     */
    public function countryTokens(IcpBrief $brief): array
    {
        $regions = $this->selectedRegions($brief);
        if ($regions === []) {
            $label = $this->primaryLabel($brief);

            return $label !== '' ? [mb_strtolower($label)] : [];
        }

        $tokens = [];
        foreach ($regions as $region) {
            $tokens = array_merge(
                $tokens,
                [mb_strtolower($region['label']), $region['gl'], mb_strtolower($region['hunterCountry'])],
                $region['aliases'],
                array_keys($region['cities']),
            );
        }

        return array_values(array_unique($tokens));
    }

    /**
     * @param  array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null  $region
     * @return array{location?: string, gl?: string}
     */
    public function serperParams(IcpBrief $brief, ?array $region = null): array
    {
        if ($brief->territories === []) {
            return [];
        }

        $region ??= $this->resolveRegion($brief);
        if ($region === null) {
            $fallback = $this->primaryLabel($brief);

            return $fallback !== '' ? ['location' => $fallback] : [];
        }

        $city = $this->firstCityFromTerritories($brief, $region);
        $location = $city !== null
            ? $city . ', ' . $region['label']
            : $region['label'];

        return [
            'location' => $location,
            'gl' => $region['gl'],
        ];
    }

    /**
     * @param  array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null  $region
     * @return list<array<string, string>>
     */
    public function hunterHeadquarters(IcpBrief $brief, ?array $region = null): array
    {
        if ($brief->territories === []) {
            return [];
        }

        $region ??= $this->resolveRegion($brief);
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

    /**
     * @param  array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null  $region
     */
    public function appendTerritoryClause(IcpBrief $brief, string $query, ?array $region = null): string
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

        $label = $region['label'] ?? $this->primaryLabel($brief);
        if ($label === '') {
            return $query;
        }

        if (preg_match('/\b' . preg_quote($label, '/') . '\b/iu', $query)) {
            return $query;
        }

        return trim($query . ' ' . $label);
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

        foreach ($this->regions() as $region) {
            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b' . preg_quote($cityKey, '/') . '\b/u', $haystack)) {
                    return $cityLabel . ', ' . $region['label'];
                }
            }
            $iso = mb_strtolower($region['hunterCountry']);
            // Match HQ codes like NG/GB; skip codes that collide with English words / abbreviations.
            $ambiguousIso = [
                'us',
                'in',
                'co', // company / Colombia
                'or',
                'no',
                'so',
                'do',
                'to',
                'me',
                'be',
                'by',
                'as',
                'at',
                'if',
                'it',
                'on',
                'an',
                'am',
                'id', // Indonesia vs identifier
                'al',
                're',
                'is',
                'my',
                'ok',
            ];
            if (
                ! in_array($iso, $ambiguousIso, true)
                && preg_match('/\b' . preg_quote($iso, '/') . '\b/u', $haystack)
            ) {
                return $region['label'];
            }
            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b' . preg_quote($alias, '/') . '\b/u', $haystack)) {
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

        // Country LinkedIn hosts: ng.linkedin.com, de.linkedin.com, etc.
        foreach ($this->regions() as $region) {
            $gl = preg_quote($region['gl'], '/');
            $iso = preg_quote(mb_strtolower($region['hunterCountry']), '/');
            if (preg_match('/(?:^|[\/\s:@])(?:' . $gl . '|' . $iso . ')\.linkedin\.com(?:[\/:?#\s]|$)/u', $haystack)) {
                return $region['label'];
            }
        }

        // Special UK compound TLD.
        if (
            preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.co\.uk(?:[\/:?#\s]|$)/u', $haystack)
            || preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.uk(?:[\/:?#\s]|$)/u', $haystack)
        ) {
            return 'England';
        }

        // Skip generic / multi-letter TLDs and ambiguous 2-letter codes that collide with words or gTLDs.
        $skipTlds = [
            'com',
            'net',
            'org',
            'io',
            'ai',
            'app',
            'dev',
            'co',
            'info',
            'biz',
            'edu',
            'gov',
            'mil',
            'int',
            'xyz',
            'online',
            'site',
            'store',
            'tech',
            'cloud',
            'me',
            'tv',
            'fm',
            'cc',
            'ws',
            'to',
            'in',
            'us',
        ];

        foreach ($this->regions() as $region) {
            $gl = $region['gl'];
            if (mb_strlen($gl) !== 2 || in_array($gl, $skipTlds, true)) {
                continue;
            }
            // Avoid matching .in inside .info etc. by requiring end or path boundary.
            if (preg_match('/(?:^|[\/\s:@])(?:[\w-]+\.)*[\w-]+\.' . preg_quote($gl, '/') . '(?:[\/:?#\s]|$)/u', $haystack)) {
                return $region['label'];
            }
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
        foreach ($this->regions() as $region) {
            $candidates = array_merge(
                [mb_strtolower($region['label']), mb_strtolower($region['gl']), mb_strtolower($region['hunterCountry'])],
                $region['aliases'],
                array_keys($region['cities']),
                array_map(static fn(string $label): string => mb_strtolower($label), array_values($region['cities'])),
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
     * Search catalog countries and cities for the ICP place picker.
     *
     * @return list<array{label: string, type: string, country: string, gl: string}>
     */
    public function searchPlaces(string $query, int $limit = 20): array
    {
        $q = mb_strtolower(trim($query));
        if ($q === '' || mb_strlen($q) < 1) {
            return [];
        }

        $limit = max(1, min(50, $limit));
        $matches = [];

        foreach ($this->regions() as $region) {
            $countryLabel = $region['label'];
            $haystack = mb_strtolower(implode(' ', array_merge(
                [$countryLabel, $region['gl'], $region['hunterCountry']],
                $region['aliases'],
            )));
            if (str_contains($haystack, $q) || str_starts_with(mb_strtolower($countryLabel), $q)) {
                $matches[] = [
                    'label' => $countryLabel,
                    'type' => 'country',
                    'country' => $countryLabel,
                    'gl' => $region['gl'],
                ];
            }

            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (str_contains($cityKey, $q) || str_starts_with(mb_strtolower($cityLabel), $q)) {
                    $matches[] = [
                        'label' => $cityLabel . ', ' . $countryLabel,
                        'type' => 'city',
                        'country' => $countryLabel,
                        'gl' => $region['gl'],
                    ];
                }
            }

            if (count($matches) >= $limit * 3) {
                break;
            }
        }

        // Prefer exact / prefix country matches, then cities.
        usort($matches, static function (array $a, array $b) use ($q): int {
            $aExact = mb_strtolower($a['label']) === $q || mb_strtolower($a['country']) === $q ? 0 : 1;
            $bExact = mb_strtolower($b['label']) === $q || mb_strtolower($b['country']) === $q ? 0 : 1;
            if ($aExact !== $bExact) {
                return $aExact <=> $bExact;
            }
            $aType = $a['type'] === 'country' ? 0 : 1;
            $bType = $b['type'] === 'country' ? 0 : 1;
            if ($aType !== $bType) {
                return $aType <=> $bType;
            }

            return strlen($a['label']) <=> strlen($b['label']);
        });

        $seen = [];
        $out = [];
        foreach ($matches as $match) {
            $key = mb_strtolower($match['label']);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $match;
            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    /**
     * @return array{label: string, gl: string, hunterCountry: string, aliases: list<string>, cities: array<string, string>}|null
     */
    public function regionFromValue(string $value): ?array
    {
        $normalized = mb_strtolower(trim($value));
        if ($normalized === '') {
            return null;
        }

        $iso = $this->isoCodeFromValue($normalized);

        foreach ($this->regions() as $region) {
            if ($iso !== null && ($iso === $region['gl'] || $iso === mb_strtolower($region['hunterCountry']))) {
                return $region;
            }

            if (preg_match('/\b' . preg_quote(mb_strtolower($region['label']), '/') . '\b/u', $normalized)) {
                return $region;
            }

            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b' . preg_quote($alias, '/') . '\b/u', $normalized)) {
                    return $region;
                }
            }

            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b' . preg_quote($cityKey, '/') . '\b/u', $normalized)) {
                    return $region;
                }
            }
        }

        return null;
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
            if (preg_match('/\b' . preg_quote($cityKey, '/') . '\b/u', $haystack)) {
                return $cityLabel;
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
        foreach ($this->regions() as $region) {
            foreach ($region['aliases'] as $alias) {
                if (mb_strlen($alias) < 3) {
                    continue;
                }
                if (preg_match('/\b' . preg_quote($alias, '/') . '\b/u', $lower)) {
                    $found[$region['gl']] = $region['gl'];
                    break;
                }
            }
            if (isset($found[$region['gl']])) {
                continue;
            }
            if (preg_match('/\b' . preg_quote(mb_strtolower($region['label']), '/') . '\b/u', $lower)) {
                $found[$region['gl']] = $region['gl'];

                continue;
            }
            foreach ($region['cities'] as $cityKey => $cityLabel) {
                if (preg_match('/\b' . preg_quote($cityKey, '/') . '\b/u', $lower)) {
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
