<?php

namespace App\Services\Discovery;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Diversified search strings for Discovery fan-out.
 *
 * new_plan.md: ICP firmographic fields (industry, size, revenue, territory,
 * target roles) are never concatenated into search queries. Fan-out uses the
 * user's typed question, or interest language (customPrompt / description).
 */
class QueryVariationGenerator
{
    public const MAX_QUERIES = 15;

    public const FAN_OUT_THRESHOLD = 20;

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
            $variations[] = $primary;
        }

        $seed = $this->searchSeed($brief);
        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 4) as $i => $signal) {
            $variations[] = $this->composePeopleOrCompany($brief, $seed.' '.$signal, $i % 2 === 0);
        }

        if ($brief->isPeopleSearch() || $brief->isAuthoritativePeopleQuery()) {
            foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 2) as $hint) {
                $variations[] = trim($seed.' '.$hint);
            }
            $variations[] = $this->composePeopleOrCompany($brief, $seed, true);
        } else {
            $variations[] = $this->composePeopleOrCompany($brief, $seed.' companies', true);
        }

        return $this->dedupeAndCap($variations, $needed);
    }

    public function queryBudget(int $targetCount): int
    {
        $estimated = (int) ceil(max(1, $targetCount) / 5);

        return min(self::MAX_QUERIES, max(4, $estimated));
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

        foreach (['executives', 'founders', 'leadership team', 'decision makers', 'partnerships'] as $hint) {
            $variations[] = $this->composePeopleOrCompany($brief, $seed.' '.$hint, false);
        }

        foreach (array_slice(self::SIGNAL_MODIFIERS, 0, 5) as $i => $signal) {
            $variations[] = $this->composePeopleOrCompany($brief, $seed.' '.$signal, $i % 2 === 0);
        }

        foreach (array_slice(self::AUTHORITATIVE_LIST_HINTS, 0, 3) as $hint) {
            $variations[] = trim($seed.' '.$hint);
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
