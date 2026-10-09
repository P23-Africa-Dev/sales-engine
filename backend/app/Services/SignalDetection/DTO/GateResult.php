<?php

namespace App\Services\SignalDetection\DTO;

readonly class GateResult
{
    private function __construct(
        public bool $admitted,
        public ?string $reason,
        public bool $inferred = false,
    ) {}

    public static function admit(bool $inferred = false): self
    {
        return new self(true, null, $inferred);
    }

    public static function reject(string $reason): self
    {
        return new self(false, $reason, false);
    }
}
