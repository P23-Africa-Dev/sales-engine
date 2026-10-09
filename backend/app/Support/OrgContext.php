<?php

namespace App\Support;

use App\Models\Organization;
use App\Models\User;
use RuntimeException;

class OrgContext
{
    private static ?Organization $organization = null;

    public static function set(?Organization $organization): void
    {
        self::$organization = $organization;
    }

    public static function get(): ?Organization
    {
        return self::$organization;
    }

    public static function require(): Organization
    {
        if (! self::$organization) {
            throw new RuntimeException('Organization context is not set.');
        }

        return self::$organization;
    }

    public static function clear(): void
    {
        self::$organization = null;
    }

    public static function resolveForUser(User $user, ?int $organizationId = null): Organization
    {
        if ($organizationId) {
            $org = $user->organizations()->where('organizations.id', $organizationId)->first();
            if (! $org) {
                abort(403, 'You are not a member of this organization.');
            }

            return $org;
        }

        $org = $user->defaultOrganization();
        if (! $org) {
            abort(422, 'No organization found. Create one first.');
        }

        return $org;
    }
}
