<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Builds diversified search query strings for high-capacity lead discovery fan-out.
 */
class QueryVariationGenerator
{
    public const MAX_QUERIES = 15;

    public const FAN_OUT_THRESHOLD = 20;

    /** @var list<string> */
    private const DEFAULT_PEOPLE_TITLES = [
        'CEO',
        'CTO',
        'founder',
        'VP Sales',
        'Head of Partnerships',
        'Managing Director',
        'COO',
        'VP Engineering',
    ];

    /** @var list<string> */
    private const DEFAULT_COMPANY_MODIFIERS = [
        'distributors',
        'companies',
        'startups',
        'enterprises',
        'agencies',
    ];

    /** @var list<string> */
    private const SIGNAL_MODIFIERS = [
        'hiring',
        'funded',
        'expanding',
        'series A OR series B',
        'partnership',
    ];

    /** @var list<string> */
    private const AUTHORITATIVE_LIST_HINTS = [
        'Forbes list',
        'Inc 5000',
        'Y Combinator companies',
        'Crunchbase',
    ];

    /**
     * @return list<string> Ready-to-run Serper query strings (capped at MAX_QUERIES).
     */
    public function generate(IcpBrief $brief, int $targetCount): array
    {
        $needed = $this->queryBudget($targetCount);
        $variations = [];

        $base = trim($brief->query);
        $hasUserQuery = $brief->hasUserQuery();
        $industries = array_values(array_filter(array_map('trim', $brief->industries)));
        $territories = array_values(array_filter(array_map('trim', $brief->territories)));
        $titles = array_values(array_filter(array_map('trim', $brief->decisionMakers)));
        if ($titles === []) {
            $titles = $brief->isPeopleSearch() ? self::DEFAULT_PEOPLE_TITLES : self::DEFAULT_COMPANY_MODIFIERS;
        }

        // Always include the primary search query first.
        $primary = $brief->searchQuery();
        if ($primary !== '') {
            $variations[] = $primary;
        }

        if ($hasUserQuery && $base !== '') {
            foreach (array_slice($territories, 0, 3) as $i => $territory) {
                $variations[] = $this->composePeopleOrCompany($brief, $base, null, $territory, $i % 2 === 0);
            }

            foreach (array_slice($titles, 0, 5) as $i => $title) {
                $variations[] = $this->composePeopleOrCompany(
                    $brief,
                    $base,
                    $title,
                    $territories[0] ?? null,
                    $i % 2 === 1,
                );
            }

            foreach (array_slice($industries, 0, 4) as $i => $industry) {
                $variations[] = $this->composePeopleOrCompany(
                    $brief,
                    $base.' '.$industry,
                    $titles[0] ?? null,
                    $territories[0] ?? null,
                    $i % 2 === 0,
                );
            }

            foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 3) as $i => $signal) {
                $variations[] = $this->composePeopleOrCompany(
                    $brief,
                    $base.' '.$signal,
                    $titles[0] ?? null,
                    null,
                    $i % 2 === 1,
                );
            }

            if ($brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
                foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 2) as $hint) {
                    $variations[] = trim($base.' '.$hint);
                }
            }
        } else {
            // ICP-only: permute industries × territories × titles.
            $industrySlice = array_slice($industries !== [] ? $industries : ['B2B'], 0, 5);
            $territorySlice = array_slice($territories !== [] ? $territories : [''], 0, 3);
            $titleSlice = array_slice($titles, 0, 5);
            $variantIndex = 0;

            foreach ($industrySlice as $industry) {
                foreach ($territorySlice as $territory) {
                    foreach ($titleSlice as $title) {
                        $variations[] = $this->composePeopleOrCompany(
                            $brief,
                            $industry,
                            $title,
                            $territory !== '' ? $territory : null,
                            $variantIndex % 2 === 0,
                        );
                        $variantIndex++;
                        if (count($variations) >= $needed * 2) {
                            break 3;
                        }
                    }
                }
            }

            foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 3) as $i => $signal) {
                $seed = ($industrySlice[0] ?? 'companies').' '.$signal;
                $variations[] = $this->composePeopleOrCompany(
                    $brief,
                    $seed,
                    $titleSlice[0] ?? null,
                    $territorySlice[0] !== '' ? $territorySlice[0] : null,
                    $i % 2 === 0,
                );
            }
        }

        return $this->dedupeAndCap($variations, $needed);
    }

    public function queryBudget(int $targetCount): int
    {
        // Roughly 5 usable hits per query after filters → budget enough queries to hit target.
        $estimated = (int) ceil(max(1, $targetCount) / 5);

        return min(self::MAX_QUERIES, max(4, $estimated));
    }

    /**
     * Broader follow-up queries when the first fan-out pass yields too few leads.
     * Drops location constraints, rotates unused titles/industries/signals, and excludes
     * queries already executed in earlier passes.
     *
     * @param  list<string>  $excludeQueries
     * @return list<string>
     */
    public function generateBackfill(IcpBrief $brief, int $targetCount, array $excludeQueries = []): array
    {
        $needed = min(self::MAX_QUERIES, max(4, (int) ceil(max(1, $targetCount) / 4)));
        $variations = [];

        $industries = array_values(array_filter(array_map('trim', $brief->industries)));
        $titles = array_values(array_filter(array_map('trim', $brief->decisionMakers)));
        if ($titles === []) {
            $titles = $brief->isPeopleSearch() ? self::DEFAULT_PEOPLE_TITLES : self::DEFAULT_COMPANY_MODIFIERS;
        }

        $base = trim($brief->query);
        $seed = $base !== '' ? $base : ($industries[0] ?? 'B2B');

        // Broader people/company searches without territory lock-in.
        foreach (array_slice($titles, 0, 8) as $i => $title) {
            $variations[] = $this->composePeopleOrCompany($brief, $seed, $title, null, $i % 2 === 0);
        }

        foreach (array_slice($industries !== [] ? $industries : ['B2B'], 0, 5) as $industry) {
            foreach (array_slice($titles, 0, 4) as $i => $title) {
                $variations[] = $this->composePeopleOrCompany($brief, $industry, $title, null, $i % 2 === 1);
            }
            foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 4) as $i => $signal) {
                $variations[] = $this->composePeopleOrCompany(
                    $brief,
                    $industry.' '.$signal,
                    $titles[0] ?? null,
                    null,
                    $i % 2 === 0,
                );
            }
        }

        // Open-web company / directory rescue queries (not LinkedIn-only).
        foreach (array_slice($industries !== [] ? $industries : ['FinTech'], 0, 3) as $industry) {
            $variations[] = trim($industry.' companies startups "CEO" OR founder');
            $variations[] = trim($seed.' '.$industry.' decision makers partnerships');
        }

        foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 3) as $hint) {
            $variations[] = trim($seed.' '.$hint);
            if ($industries !== []) {
                $variations[] = trim($industries[0].' '.$hint);
            }
        }

        // Synonym / alternate framing without location.
        foreach (['executives', 'founders', 'leadership team', 'decision makers'] as $roleHint) {
            $variations[] = $this->composePeopleOrCompany($brief, $seed.' '.$roleHint, null, null);
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

    private function composePeopleOrCompany(
        IcpBrief $brief,
        string $seed,
        ?string $title,
        ?string $territory,
        bool $preferLinkedIn = true,
    ): string {
        $safeTitle = null;
        if ($title !== null && $title !== '') {
            // Serper free accounts reject complex quoted titles (esp. with "/") when num is high.
            $safeTitle = trim(preg_replace('/\s*\/\s*/u', ' ', $title) ?? $title);
            $safeTitle = trim(preg_replace('/\s+/u', ' ', $safeTitle) ?? $safeTitle);
        }

        $parts = array_filter([
            trim($seed),
            $safeTitle !== null && $safeTitle !== '' ? $safeTitle : null,
            $territory !== null && $territory !== '' ? $territory : null,
        ]);

        $query = trim(implode(' ', $parts));

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
