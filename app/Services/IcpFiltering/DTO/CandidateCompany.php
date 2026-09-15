<?php

namespace App\Services\IcpFiltering\DTO;

/**
 * The minimal, structured facts about a company needed to evaluate it against
 * an ICP's hard filter fields (Stage 1). Deliberately narrow — this is not a
 * general company profile, just what IcpFilterService needs to check.
 */
readonly class CandidateCompany
{
    public function __construct(
        public ?string $industry = null,
        public ?string $companySize = null,
        public ?string $revenue = null,
        public ?string $territory = null,
    ) {}
}
