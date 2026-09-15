<?php

namespace App\Services\IcpFiltering\DTO;

/**
 * Outcome of running a CandidateCompany through IcpFilterService::passes().
 *
 * `reasons` always has one entry per field IcpFilterService evaluates
 * (industry, companySize, revenue, territory), true meaning "this field
 * matched or the ICP didn't constrain it" and false meaning "this field
 * is why the candidate failed." This is what the API/UI surface as the
 * Stage 1 audit trail (`icpFilter.reasons`).
 */
readonly class IcpFilterResult
{
    /**
     * @param  array<string, bool>  $reasons
     */
    public function __construct(
        public bool $passed,
        public array $reasons,
    ) {}
}
