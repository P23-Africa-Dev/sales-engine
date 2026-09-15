<?php

namespace App\Services\SignalDetection\DTO;

use Carbon\CarbonInterface;

/**
 * Stage 2 extraction result (new_plan.md record shape).
 */
readonly class DetectedSignal
{
    /**
     * @param  list<string>  $namedPeople
     */
    public function __construct(
        public bool $matched,
        public string $signalTypeKey,
        public ?string $company = null,
        public ?string $description = null,
        public ?string $sourceUrl = null,
        public ?CarbonInterface $sourceDate = null,
        public ?string $territory = null,
        public array $namedPeople = [],
        public ?string $companySize = null,
        public ?string $revenue = null,
        public ?string $industry = null,
        public ?string $rejectReason = null,
    ) {}
}
