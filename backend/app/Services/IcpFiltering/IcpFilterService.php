<?php

namespace App\Services\IcpFiltering;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\DTO\IcpFilterResult;

/**
 * Stage 1 of the buyer-signal pipeline (see docs/backend_implementation_plan.md).
 *
 * This is a deterministic, structured-field-only gate — no LLM call, and
 * `customPrompt`/`description` are never consulted here. Those are Stage 2
 * interest context, not Stage 1 filter criteria; new_plan.md's own Stage 1
 * field table never lists customPrompt.
 *
 * A field the ICP left unconstrained (empty list) always matches — an ICP
 * that never specified a revenue range isn't filtering on revenue. A field
 * the ICP DID constrain, but the candidate has no data for, fails closed:
 * a hard gate that can't verify a criterion should reject, not assume.
 *
 * IMPORTANT — $availableFields: as of this writing, neither the Discovery
 * extraction pipeline nor the Social Listening enricher produce structured
 * companySize/revenue data for a candidate (there is no firmographic data
 * provider wired in yet — see docs/backend_implementation_plan.md Phase 2/8
 * follow-ups). Fail-closed is only correct for a field the data source could
 * plausibly have populated. Passing a caller-supplied $availableFields list
 * lets a pipeline that structurally cannot supply a field (e.g. revenue)
 * mark it "not evaluated" (always passes) instead of hard-failing every
 * candidate on a field its own extraction can never fill in. Default is all
 * four fields, for pipelines (or tests) that do have complete data.
 */
class IcpFilterService
{
    public const ALL_FIELDS = ['industry', 'companySize', 'revenue', 'territory'];

    /**
     * @param  list<string>  $availableFields  Which fields this candidate's data source can
     *                                         actually populate. Fields outside this list are
     *                                         always treated as passed (not evaluated), regardless
     *                                         of whether the ICP constrains them.
     */
    public function passes(IcpBrief $brief, CandidateCompany $candidate, array $availableFields = self::ALL_FIELDS): IcpFilterResult
    {
        $reasons = [
            'industry' => ! in_array('industry', $availableFields, true)
                || $this->matchesList($brief->industries, $candidate->industry),
            'companySize' => ! in_array('companySize', $availableFields, true)
                || $this->matchesList($brief->companySizes, $candidate->companySize),
            'revenue' => ! in_array('revenue', $availableFields, true)
                || $this->matchesList($brief->revenueRanges, $candidate->revenue),
            'territory' => ! in_array('territory', $availableFields, true)
                || $this->matchesTerritory($brief->territories, $candidate->territory),
        ];

        // The user's own exclusions ("brokers", "staffing agencies"). Only
        // evaluated when the caller supplies the candidate's profile text, so
        // pipelines without it keep the original four-field audit trail.
        if ($candidate->profileText !== null && $this->usableExclusions($brief) !== []) {
            $reasons['exclusions'] = $this->matchedExclusion($brief, $candidate->profileText) === null;
        }

        return new IcpFilterResult(
            passed: ! in_array(false, $reasons, true),
            reasons: $reasons,
        );
    }

    /**
     * The first ICP exclusion the text matches, or null. Plurals and simple
     * derivations match the same stem ("brokers" also catches "brokerage").
     */
    public function matchedExclusion(IcpBrief $brief, string $text): ?string
    {
        $haystack = mb_strtolower($text);
        if (trim($haystack) === '') {
            return null;
        }

        foreach ($this->usableExclusions($brief) as $exclusion) {
            $words = preg_split('/\s+/u', mb_strtolower($exclusion)) ?: [];
            $last = (string) array_pop($words);
            $stem = preg_replace('/(ies|es|s|y)$/u', '', $last) ?? $last;
            if (mb_strlen($stem) < 4) {
                $stem = $last;
            }
            $pattern = '/\b'.implode('\s+', array_map(static fn ($w) => preg_quote($w, '/'), [...$words, $stem])).'\w*/u';
            if (preg_match($pattern, $haystack)) {
                return $exclusion;
            }
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function usableExclusions(IcpBrief $brief): array
    {
        return array_values(array_filter(
            array_map(static fn ($e) => trim((string) $e), $brief->exclusions),
            static fn (string $e) => mb_strlen($e) >= 3,
        ));
    }

    /**
     * Generic matcher for industry / companySize / revenue: unconstrained lists
     * always pass; otherwise the candidate value must equal or substring-match
     * one of the allowed values (case-insensitive, either direction — ICP labels
     * and free-form extracted values rarely use identical casing/wording).
     *
     * @param  list<string>  $allowed
     */
    private function matchesList(array $allowed, ?string $candidateValue): bool
    {
        $allowed = array_values(array_filter($allowed, fn ($v) => is_string($v) && trim($v) !== ''));
        if ($allowed === []) {
            return true;
        }

        $value = mb_strtolower(trim((string) $candidateValue));
        if ($value === '') {
            return false;
        }

        foreach ($allowed as $option) {
            $option = mb_strtolower(trim($option));
            if ($option === '') {
                continue;
            }
            if ($option === $value || str_contains($value, $option) || str_contains($option, $value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Territory matching tokenizes both sides ("Lagos, NG" -> ["lagos", "ng"])
     * and accepts any meaningful token overlap, since free-text location data
     * rarely matches an ICP's territory label verbatim.
     *
     * @param  list<string>  $allowedTerritories
     */
    private function matchesTerritory(array $allowedTerritories, ?string $candidateTerritory): bool
    {
        $allowedTerritories = array_values(array_filter($allowedTerritories, fn ($v) => is_string($v) && trim($v) !== ''));
        if ($allowedTerritories === []) {
            return true;
        }

        $candidateTerritory = trim((string) $candidateTerritory);
        if ($candidateTerritory === '') {
            return false;
        }

        $candidateTokens = $this->expandTerritoryTokens($candidateTerritory);
        if ($candidateTokens === []) {
            return false;
        }

        foreach ($allowedTerritories as $territory) {
            if ($this->inRegion($territory, $candidateTerritory, $candidateTokens)) {
                return true;
            }
            $allowedTokens = $this->expandTerritoryTokens($territory);
            if (array_intersect($candidateTokens, $allowedTokens) !== []) {
                return true;
            }
        }

        return false;
    }

    /**
     * An ICP territory that names a region ("Africa", "East Africa", "Europe") accepts any
     * place in it, so a company opening in Kenya fits an ICP aimed at Africa.
     *
     * @param  list<string>  $candidateTokens
     */
    private function inRegion(string $territory, string $candidate, array $candidateTokens): bool
    {
        $members = self::REGIONS[mb_strtolower(trim($territory))] ?? null;
        if ($members === null) {
            return false;
        }

        $normalized = mb_strtolower($candidate);
        foreach ($members as $member) {
            if (str_contains($member, ' ') ? str_contains($normalized, $member) : in_array($member, $candidateTokens, true)) {
                return true;
            }
        }

        return false;
    }

    private const WEST_AFRICA = ['nigeria', 'lagos', 'abuja', 'ghana', 'accra', 'senegal', 'dakar', "cote d'ivoire", 'ivory coast', 'abidjan', 'benin', 'togo', 'lome', 'burkina faso', 'mali', 'niger', 'guinea', 'sierra leone', 'liberia', 'gambia', 'cameroon', 'douala'];

    private const EAST_AFRICA = ['kenya', 'nairobi', 'mombasa', 'uganda', 'kampala', 'tanzania', 'dar es salaam', 'rwanda', 'kigali', 'ethiopia', 'addis ababa', 'burundi', 'somalia', 'south sudan', 'djibouti'];

    private const SOUTHERN_AFRICA = ['south africa', 'johannesburg', 'cape town', 'durban', 'botswana', 'namibia', 'zambia', 'lusaka', 'zimbabwe', 'harare', 'mozambique', 'malawi', 'angola', 'luanda', 'lesotho', 'eswatini', 'madagascar', 'mauritius'];

    private const NORTH_AFRICA = ['egypt', 'cairo', 'morocco', 'casablanca', 'algeria', 'tunisia', 'libya', 'sudan'];

    private const EUROPE = ['germany', 'netherlands', 'holland', 'france', 'sweden', 'denmark', 'norway', 'finland', 'belgium', 'spain', 'italy', 'portugal', 'austria', 'switzerland', 'poland', 'ireland', 'united kingdom', 'uk', 'england', 'scotland', 'wales', 'czech', 'hungary', 'romania', 'greece', 'berlin', 'munich', 'hamburg', 'amsterdam', 'rotterdam', 'paris', 'stockholm', 'london'];

    private const MIDDLE_EAST = ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'saudi arabia', 'riyadh', 'qatar', 'doha', 'kuwait', 'bahrain', 'oman', 'jordan', 'israel', 'lebanon'];

    /**
     * @var array<string, list<string>>
     */
    private const REGIONS = [
        'africa' => [...self::WEST_AFRICA, ...self::EAST_AFRICA, ...self::SOUTHERN_AFRICA, ...self::NORTH_AFRICA, 'africa', 'congo', 'drc', 'gabon', 'chad', 'eritrea'],
        'sub-saharan africa' => [...self::WEST_AFRICA, ...self::EAST_AFRICA, ...self::SOUTHERN_AFRICA, 'congo', 'drc', 'gabon', 'chad'],
        'west africa' => self::WEST_AFRICA,
        'east africa' => self::EAST_AFRICA,
        'southern africa' => self::SOUTHERN_AFRICA,
        'north africa' => self::NORTH_AFRICA,
        'europe' => self::EUROPE,
        'eu' => self::EUROPE,
        'middle east' => self::MIDDLE_EAST,
        'gcc' => self::MIDDLE_EAST,
        'mena' => [...self::MIDDLE_EAST, ...self::NORTH_AFRICA],
    ];

    /**
     * Alias groups so ICP "england" matches UK / London / Britain, etc.
     *
     * @var list<list<string>>
     */
    private const TERRITORY_ALIAS_GROUPS = [
        ['england', 'uk', 'u.k.', 'united kingdom', 'britain', 'great britain', 'gb', 'london', 'manchester', 'birmingham', 'leeds', 'bristol', 'liverpool', 'sheffield'],
        ['scotland', 'edinburgh', 'glasgow'],
        ['wales', 'cardiff'],
        ['nigeria', 'lagos', 'abuja', 'kano', 'port harcourt', 'ibadan', 'ng'],
        ['kenya', 'nairobi', 'mombasa'],
        ['ghana', 'accra'],
        ['south africa', 'johannesburg', 'cape town', 'durban'],
        ['egypt', 'cairo'],
        ['united states', 'usa', 'u.s.', 'u.s.a.', 'america', 'us'],
        ['india', 'bharat', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'pune', 'kolkata', 'in'],
        ['germany', 'deutschland', 'de', 'berlin', 'munich', 'hamburg', 'frankfurt'],
        ['netherlands', 'netherland', 'holland', 'nl', 'amsterdam', 'rotterdam', 'the hague', 'utrecht'],
        ['denmark', 'danmark', 'dk', 'copenhagen', 'aarhus'],
        ['sweden', 'sverige', 'se', 'stockholm', 'gothenburg', 'malmo'],
        ['france', 'fr', 'paris', 'lyon', 'marseille'],
        ['united arab emirates', 'uae', 'u.a.e.', 'dubai', 'abu dhabi'],
        ['canada', 'ca', 'toronto', 'vancouver', 'montreal'],
        ['australia', 'au', 'sydney', 'melbourne'],
        ['rwanda', 'kigali', 'rw'],
    ];

    /**
     * @return list<string>
     */
    private function expandTerritoryTokens(string $value): array
    {
        $normalized = mb_strtolower(trim($value));
        $tokens = $this->tokenize($normalized);
        // Short geo codes (UK, NG, US) are meaningful for territory matching — but only when written
        // as a code ("Lagos, NG", "US") or as a whole comma segment. Lower-case "in" / "de" / "us"
        // inside prose ("based in London", "Rio de Janeiro") must not match India / Germany / USA.
        $segments = preg_split('/\s*[,\/|]\s*/u', trim($value)) ?: [];
        foreach ($segments as $segment) {
            foreach (preg_split('/\s+/u', trim($segment)) ?: [] as $word) {
                $word = trim($word, ' .()');
                if (mb_strlen($word) !== 2) {
                    continue;
                }
                $isUpperCode = $word === mb_strtoupper($word) && preg_match('/^\p{Lu}{2}$/u', $word);
                $isWholeSegment = mb_strtolower(trim($segment, ' .()')) === mb_strtolower($word);
                if ($isUpperCode || $isWholeSegment) {
                    $tokens[] = mb_strtolower($word);
                }
            }
        }
        $tokens = array_values(array_unique($tokens));

        foreach (self::TERRITORY_ALIAS_GROUPS as $group) {
            $hit = array_intersect($tokens, $group) !== [];
            if (! $hit) {
                foreach ($group as $alias) {
                    if (str_contains($alias, ' ') && str_contains($normalized, $alias)) {
                        $hit = true;
                        break;
                    }
                }
            }
            if ($hit) {
                $tokens = array_values(array_unique(array_merge($tokens, $group)));
            }
        }

        return $tokens;
    }

    /**
     * @return list<string>
     */
    private function tokenize(string $value): array
    {
        $parts = preg_split('/[,\s]+/u', mb_strtolower(trim($value))) ?: [];

        return array_values(array_filter($parts, fn ($p) => mb_strlen($p) >= 3));
    }
}
