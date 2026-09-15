<?php

namespace App\Services\SignalDetection\DTO;

readonly class GateResult
{
    private function __construct(
        public bool $admitted,
        public ?string $reason,
    ) {}

    public static function admit(): self
    {
        return new self(true, null);
    }

    public static function reject(string $reason): self
    {
        return new self(false, $reason);
    }
}
