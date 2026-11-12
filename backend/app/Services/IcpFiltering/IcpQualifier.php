<?php

namespace App\Services\IcpFiltering;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\CompanyFirmographicsResolver;
use App\Services\IcpFiltering\DTO\CandidateCompany;

/**
 * Decides whether the company behind a signal fits the ICP, one dimension at a time.
 * Only dimensions the ICP specifies are judged. Each is "verified", "contradicted" or
 * "unknown" (no evidence) — a missing fact never disqualifies, a conflicting one does.
 *
 *   qualified     every specified dimension verified
 *   partial       none contradicted, at least one unknown ("partly verified")
 *   not_qualified at least one contradicted
 */
class IcpQualifier
{
    public const QUALIFIED = 'qualified';

    public const PARTIAL = 'partial';

    public const NOT_QUALIFIED = 'not_qualified';

    public const VERIFIED = 'verified';

    public const CONTRADICTED = 'contradicted';

    public const UNKNOWN = 'unknown';

    /**
     * Words too broad to show two industries are the same.
     */
    private const GENERIC_INDUSTRY_WORDS = [
        'and', 'the', 'of', 'services', 'service', 'solutions', 'company', 'companies', 'industry', 'industries',
        'general', 'other', 'products', 'business', 'businesses', 'group', 'global', 'international',
    ];

    /**
     * Industries that are named differently but are the same market.
     *
     * @var list<list<string>>
     */
    private const INDUSTRY_SYNONYMS = [
        ['fintech', 'financial', 'finance', 'payments', 'payment', 'banking', 'bank', 'lending', 'insurance', 'insurtech'],
        ['agritech', 'agriculture', 'agricultural', 'agro', 'agribusiness', 'farming', 'farm', 'food'],
        ['software', 'saas', 'technology', 'it', 'internet', 'computer', 'tech', 'digital'],
        ['manufacturing', 'manufacturer', 'industrial', 'machinery', 'equipment', 'engineering'],
        ['logistics', 'transport', 'transportation', 'freight', 'shipping', 'supply', 'trucking'],
        ['healthcare', 'health', 'hospital', 'medical', 'pharmaceutical', 'pharma'],
        ['energy', 'oil', 'gas', 'renewable', 'renewables', 'solar', 'power', 'utilities'],
        ['retail', 'ecommerce', 'commerce', 'consumer', 'fmcg'],
        ['construction', 'building', 'real', 'estate', 'property'],
        ['telecommunications', 'telecom', 'telco', 'mobile'],
        ['education', 'edtech', 'learning', 'training'],
        ['venture', 'investment', 'investing', 'capital', 'private', 'equity', 'impact', 'fund'],
    ];

    public function __construct(
        private readonly IcpFilterService $filter = new IcpFilterService,
    ) {}

    /**
     * @param  array<string, mixed>  $firmographics  CompanyFirmographicsResolver output (may be empty).
     * @param  array{industry?: ?string, territory?: ?string, company_size?: ?string, revenue?: ?string}  $event  What the signal itself says.
     * @return array{status: string, dimensions: array<string, string>}
     */
    public function qualify(IcpBrief $brief, array $firmographics, array $event = []): array
    {
        $dimensions = [];

        if ($this->specified($brief->industries)) {
            $dimensions['industry'] = $this->industry($brief->industries, $firmographics['industry'] ?? null, $event['industry'] ?? null);
        }
        if ($this->specified($brief->companySizes)) {
            $dimensions['company_size'] = $this->companySize($brief->companySizes, $firmographics, $event['company_size'] ?? null);
        }
        if ($this->specified($brief->revenueRanges)) {
            $dimensions['revenue'] = $this->revenue($brief->revenueRanges, $firmographics['revenue'] ?? null, $event['revenue'] ?? null);
        }
        if ($this->specified($brief->companyLocations)) {
            // "Based in Germany or the Netherlands": the head office decides.
            $dimensions['company_location'] = $this->placeIn($brief, $brief->companyLocations, $firmographics['headquarters'] ?? null);
        }
        if ($this->specified($brief->territories)) {
            $dimensions['territory'] = $this->specified($brief->companyLocations)
                // Locations given separately: the territory is where the event happens ("expanding into Kenya").
                ? $this->placeIn($brief, $brief->territories, $event['territory'] ?? null)
                : $this->territory($brief, $firmographics['headquarters'] ?? null, $event['territory'] ?? null);
        }

        $status = self::QUALIFIED;
        if (in_array(self::CONTRADICTED, $dimensions, true)) {
            $status = self::NOT_QUALIFIED;
        } elseif (in_array(self::UNKNOWN, $dimensions, true)) {
            $status = self::PARTIAL;
        }

        return ['status' => $status, 'dimensions' => $dimensions];
    }

    /**
     * @param  list<string>  $allowed
     */
    private function industry(array $allowed, ?string $listed, ?string $stated): string
    {
        // The company's own listed industry is authoritative; an industry the model read
        // off the post can confirm a match but is too loose to rule a company out.
        if (filled($listed)) {
            return $this->industryMatches($allowed, (string) $listed) ? self::VERIFIED : self::CONTRADICTED;
        }
        if (filled($stated) && $this->industryMatches($allowed, (string) $stated)) {
            return self::VERIFIED;
        }

        return self::UNKNOWN;
    }

    /**
     * @param  list<string>  $allowed
     */
    private function industryMatches(array $allowed, string $value): bool
    {
        $valueWords = $this->expandIndustry($value);
        foreach ($allowed as $option) {
            $option = mb_strtolower(trim((string) $option));
            if ($option === '') {
                continue;
            }
            $lowerValue = mb_strtolower($value);
            if (str_contains($lowerValue, $option) || str_contains($option, $lowerValue)) {
                return true;
            }
            if (array_intersect($valueWords, $this->expandIndustry($option)) !== []) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function expandIndustry(string $value): array
    {
        $words = array_values(array_filter(
            preg_split('/[^a-z0-9]+/', mb_strtolower($value)) ?: [],
            fn (string $w): bool => mb_strlen($w) >= 2 && ! in_array($w, self::GENERIC_INDUSTRY_WORDS, true),
        ));
        $expanded = $words;
        foreach (self::INDUSTRY_SYNONYMS as $group) {
            if (array_intersect($words, $group) !== []) {
                $expanded = array_merge($expanded, $group);
            }
        }

        return array_values(array_unique($expanded));
    }

    /**
     * @param  list<string>  $allowed  e.g. ["51-200", "201-500"]
     * @param  array<string, mixed>  $firmographics
     */
    private function companySize(array $allowed, array $firmographics, ?string $stated): string
    {
        $min = $firmographics['employees_min'] ?? null;
        $max = $firmographics['employees_max'] ?? null;
        if ($min === null && filled($stated)) {
            [$min, $max] = CompanyFirmographicsResolver::parseEmployeeRange($stated);
        }
        if ($min === null) {
            return self::UNKNOWN;
        }

        foreach ($allowed as $option) {
            [$low, $high] = CompanyFirmographicsResolver::parseEmployeeRange((string) $option);
            if ($low === null) {
                continue;
            }
            // Ranges overlap: company [min, max] vs allowed [low, high].
            if (($high === null || $min <= $high) && ($max === null || $max >= $low)) {
                return self::VERIFIED;
            }
        }

        return self::CONTRADICTED;
    }

    /**
     * @param  list<string>  $allowed  e.g. ["$10M-$50M", "$100M+"]
     */
    private function revenue(array $allowed, ?string $listed, ?string $stated): string
    {
        $amount = $this->moneyInMillions($listed) ?? $this->moneyInMillions($stated);
        if ($amount === null) {
            return self::UNKNOWN;
        }

        foreach ($allowed as $option) {
            $option = (string) $option;
            if (preg_match('/under\s*\$?\s*([\d.]+)\s*([mb])/i', $option, $m)) {
                if ($amount < $this->toMillions((float) $m[1], $m[2])) {
                    return self::VERIFIED;
                }

                continue;
            }
            if (preg_match('/\$?\s*([\d.]+)\s*([mb])\s*[-–]\s*\$?\s*([\d.]+)\s*([mb])/i', $option, $m)) {
                if ($amount >= $this->toMillions((float) $m[1], $m[2]) && $amount <= $this->toMillions((float) $m[3], $m[4])) {
                    return self::VERIFIED;
                }

                continue;
            }
            if (preg_match('/\$?\s*([\d.]+)\s*([mb])\s*\+/i', $option, $m) && $amount >= $this->toMillions((float) $m[1], $m[2])) {
                return self::VERIFIED;
            }
        }

        return self::CONTRADICTED;
    }

    private function moneyInMillions(?string $text): ?float
    {
        if (! filled($text) || ! preg_match('/([\d.,]+)\s*(billion|bn|b|million|mn|m)\b/i', (string) $text, $m)) {
            return null;
        }

        return $this->toMillions((float) str_replace(',', '', $m[1]), $m[2]);
    }

    private function toMillions(float $value, string $unit): float
    {
        return str_starts_with(mb_strtolower($unit), 'b') ? $value * 1000 : $value;
    }

    /**
     * Where the company is based OR where the event happens: a German manufacturer opening
     * in Kenya fits an ICP aimed at Africa.
     */
    private function territory(IcpBrief $brief, ?string $headquarters, ?string $eventTerritory): string
    {
        $known = array_values(array_filter([$headquarters, $eventTerritory], fn ($v): bool => filled($v)));
        if ($known === []) {
            return self::UNKNOWN;
        }

        foreach ($known as $place) {
            if ($this->filter->passes($brief, new CandidateCompany(territory: (string) $place), ['territory'])->passed) {
                return self::VERIFIED;
            }
        }

        return self::CONTRADICTED;
    }

    /**
     * @param  list<string>  $places
     */
    private function placeIn(IcpBrief $brief, array $places, ?string $place): string
    {
        if (! filled($place)) {
            return self::UNKNOWN;
        }

        return $this->filter->passes($brief->withTerritories($places), new CandidateCompany(territory: (string) $place), ['territory'])->passed
            ? self::VERIFIED
            : self::CONTRADICTED;
    }

    /**
     * @param  array<int, mixed>  $values
     */
    private function specified(array $values): bool
    {
        foreach ($values as $value) {
            if (is_string($value) && trim($value) !== '') {
                return true;
            }
        }

        return false;
    }
}
