<?php

namespace App\Services\Discovery\Adapters;

use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\SearchContext;
use Illuminate\Support\Collection;

/**
 * Pluggable stub — returns empty until API key is configured and adapter is implemented.
 */
abstract class StubDiscoveryAdapter implements DiscoverySourceInterface
{
    abstract protected function configKey(): string;

    abstract protected function envHint(): string;

    public function isEnabled(): bool
    {
        return trim((string) data_get(config('services'), $this->configKey())) !== '';
    }

    public function search(IcpBrief $brief, SearchContext $ctx): Collection
    {
        // Enabled stubs stay no-op until full provider integration ships.
        return collect();
    }
}
