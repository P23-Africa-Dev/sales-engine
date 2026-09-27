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
        /** Country label this hit was searched under, so quota can be shared across markets. */
        public ?string $region = null,
    ) {}

    public function withRegion(?string $region): self
    {
        return new self(
            name: $this->name,
            source: $this->source,
            provider: $this->provider,
            website: $this->website,
            location: $this->location,
            sector: $this->sector,
            snippet: $this->snippet,
            url: $this->url,
            externalId: $this->externalId,
            meta: $this->meta,
            region: $region,
        );
    }
}
