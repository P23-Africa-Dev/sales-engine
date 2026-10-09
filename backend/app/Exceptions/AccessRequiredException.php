<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Thrown when a Factory23 user has no Sales Engine account/link yet.
 * Controllers map this to HTTP 403 with reason=access_required.
 */
class AccessRequiredException extends RuntimeException
{
    public function __construct(string $message = 'Sales Engine access is required.')
    {
        parent::__construct($message);
    }
}
