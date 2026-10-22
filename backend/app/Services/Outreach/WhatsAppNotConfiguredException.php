<?php

namespace App\Services\Outreach;

use InvalidArgumentException;

class WhatsAppNotConfiguredException extends InvalidArgumentException
{
    public function __construct(string $message = 'WhatsApp sending is not configured.')
    {
        parent::__construct($message);
    }
}
