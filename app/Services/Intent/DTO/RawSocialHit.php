<?php

namespace App\Services\Intent\DTO;

use Carbon\CarbonInterface;

readonly class RawSocialHit
{
    public function __construct(
        public string $platform,
        public string $sourceLabel,
        public string $sourceIcon,
        public string $postText,
        public ?string $postUrl,
        public ?string $snippet,
        public ?string $title,
        public ?string $authorName = null,
        public ?CarbonInterface $postedAt = null,
        public ?string $dateRaw = null,
    ) {}
}
