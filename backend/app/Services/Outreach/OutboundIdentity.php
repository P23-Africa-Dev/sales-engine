<?php

namespace App\Services\Outreach;

readonly class OutboundIdentity
{
    public function __construct(
        public string $fromEmail,
        public string $fromName,
        public string $replyTo,
        public string $senderType,
        public ?int $mailboxId = null,
        public ?int $inboxId = null,
    ) {}
}
