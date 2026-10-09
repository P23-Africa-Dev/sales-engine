<?php

namespace App\Services\Discovery\Contracts;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Support\Collection;

interface DiscoverySourceInterface
{
    public function key(): string;

    public function isEnabled(): bool;

    /**
     * @return Collection<int, RawDiscoveryHit>
     */
    public function search(IcpBrief $brief, SearchContext $ctx): Collection;
}
