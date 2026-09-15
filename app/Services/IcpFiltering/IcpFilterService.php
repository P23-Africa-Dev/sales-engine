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
     *                                          actually populate. Fields outside this list are
     *                                          always treated as passed (not evaluated), regardless
     *                                          of whether the ICP constrains them.
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

        return new IcpFilterResult(
            passed: ! in_array(false, $reasons, true),
            reasons: $reasons,
        );
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

        $candidateTokens = $this->tokenize($candidateTerritory);
        if ($candidateTokens === []) {
            return false;
        }

        foreach ($allowedTerritories as $territory) {
            $allowedTokens = $this->tokenize($territory);
            if (array_intersect($candidateTokens, $allowedTokens) !== []) {
                return true;
            }
        }

        return false;
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
