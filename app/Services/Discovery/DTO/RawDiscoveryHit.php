<?php

namespace App\Services\Discovery\DTO;

readonly class RawDiscoveryHit
{
    public function __construct(
        public string $name,
        public string $source,
        public string $provider,
        public ?string $website = null,
        public ?string $location = null,
        public ?string $sector = null,
        public ?string $snippet = null,
        public ?string $url = null,
        public ?string $externalId = null,
        public array $meta = [],
    ) {}
}
