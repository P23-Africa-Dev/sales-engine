<?php

namespace App\Services\Intent\Contracts;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use Illuminate\Support\Collection;

interface SocialSourceInterface
{
    public function key(): string;

    public function isEnabled(IcpBrief $brief, array $enabledSources): bool;

    /**
     * @param  string  $tbs  Serper time filter, e.g. qdr:d / qdr:w / qdr:m
     * @return Collection<int, RawSocialHit>
     */
    public function search(
        IcpBrief $brief,
        string $query,
        int $organizationId,
        int $limit = 8,
        string $tbs = 'qdr:w',
    ): Collection;
}
