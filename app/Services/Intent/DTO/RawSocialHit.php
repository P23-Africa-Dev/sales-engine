<?php

namespace App\Services\Intent\DTO;

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
    ) {}
}
