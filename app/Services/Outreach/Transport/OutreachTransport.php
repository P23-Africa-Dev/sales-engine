<?php

namespace App\Services\Outreach\Transport;

use App\Services\Outreach\OutboundIdentity;

interface OutreachTransport
{
    /**
     * @return array{message_id: ?string, sent: bool}
     */
    public function send(
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
        array $customArgs = [],
    ): array;
}
