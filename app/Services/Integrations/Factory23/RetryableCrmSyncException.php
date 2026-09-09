<?php

namespace App\Services\Integrations\Factory23;

class RetryableCrmSyncException extends CrmSyncException
{
    public function __construct(string $message, string $reason = 'transient_failure')
    {
        parent::__construct($message, $reason);
    }

    public function isRetryable(): bool
    {
        return true;
    }
}
