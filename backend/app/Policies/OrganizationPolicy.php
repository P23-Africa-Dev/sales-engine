<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\OrganizationUser;
use App\Models\User;

class OrganizationPolicy
{
    public function view(User $user, Organization $organization): bool
    {
        return $this->role($user, $organization) !== null;
    }

    public function manage(User $user, Organization $organization): bool
    {
        return in_array($this->role($user, $organization), ['owner', 'admin'], true);
    }

    private function role(User $user, Organization $organization): ?string
    {
        $role = OrganizationUser::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->value('role');

        return is_string($role) ? $role : null;
    }
}
