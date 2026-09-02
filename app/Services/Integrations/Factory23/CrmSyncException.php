<?php

namespace App\Services\Integrations\Factory23;

use InvalidArgumentException;

class CrmSyncException extends InvalidArgumentException
{
    public function __construct(
        string $message,
        public readonly string $reason,
    ) {
        parent::__construct($message);
    }
}
