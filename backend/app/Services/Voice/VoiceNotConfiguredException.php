<?php

namespace App\Services\Voice;

use InvalidArgumentException;

class VoiceNotConfiguredException extends InvalidArgumentException
{
    public function __construct(string $message = 'Voice calling is not configured.')
    {
        parent::__construct($message);
    }
}
