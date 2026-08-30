<?php

namespace Tests;

use App\Models\Organization;
use App\Models\OrganizationUser;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends \Illuminate\Foundation\Testing\TestCase
{
    use RefreshDatabase;

    protected function createUserWithOrg(array $userAttrs = [], array $orgAttrs = []): array
    {
        $user = User::factory()->create($userAttrs);
        $org = Organization::query()->create(array_merge([
            'name' => 'Test Org',
            'slug' => 'test-org-'.uniqid(),
        ], $orgAttrs));

        OrganizationUser::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'role' => 'owner',
        ]);

        return [$user, $org];
    }

    protected function actingAsOrgMember(?User $user = null, ?Organization $org = null): array
    {
        if (! $user || ! $org) {
            [$user, $org] = $this->createUserWithOrg();
        }

        Sanctum::actingAs($user);

        return [$user, $org];
    }

    protected function orgHeaders(Organization $org): array
    {
        return ['X-Organization-Id' => (string) $org->id];
    }
}
