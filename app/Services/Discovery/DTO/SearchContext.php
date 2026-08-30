<?php

namespace App\Services\Discovery\DTO;

readonly class SearchContext
{
    public function __construct(
        public int $organizationId,
        public ?int $userId = null,
        public int $limit = 10,
        public string $intent = 'generate_leads',
    ) {}
}
