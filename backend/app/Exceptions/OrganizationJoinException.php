<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Factory23 accepted the password, and the person's company already has a
 * Sales Engine workspace, but this person is not registered yet.
 * Controllers map this to HTTP 409 with reason=organization_join.
 */
class OrganizationJoinException extends RuntimeException
{
    public function __construct(public readonly string $organizationName)
    {
        parent::__construct('Your Factory23 organization already uses Sales Engine.');
    }
}
