<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminOrganizationTest extends TestCase
{
    public function test_client_user_cannot_list_admin_organizations(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/admin/organizations')->assertForbidden();
    }

    public function test_admin_can_list_and_create_organizations(): void
    {
        Mail::fake();
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);

        Organization::query()->create([
            'name' => 'Existing Co',
            'slug' => 'existing-co',
            'status' => 'active',
            'industry' => 'Logistics',
        ]);

        $this->getJson('/api/v1/admin/organizations')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $create = $this->postJson('/api/v1/admin/organizations', [
            'name' => 'Nord Tech',
            'owner_email' => 'owner@nord.example',
            'industry' => 'Software',
            'country' => 'DE',
            'scope' => 'Email outreach & lead discovery',
        ]);

        $create->assertCreated()
            ->assertJsonPath('data.name', 'Nord Tech')
            ->assertJsonPath('invitation_email', 'owner@nord.example');

        $this->assertDatabaseHas('organizations', [
            'name' => 'Nord Tech',
            'industry' => 'Software',
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('organization_invitations', [
            'email' => 'owner@nord.example',
            'role' => 'owner',
        ]);
        $this->assertDatabaseHas('admin_audit_events', [
            'action' => 'Organization provisioned',
            'platform_admin_id' => $admin->id,
        ]);
    }

    public function test_admin_can_update_organization_status_with_reason(): void
    {
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);

        $org = Organization::query()->create([
            'name' => 'Pause Me',
            'slug' => 'pause-me',
            'status' => 'active',
        ]);

        $this->patchJson('/api/v1/admin/organizations/'.$org->id, [
            'status' => 'inactive',
        ])->assertStatus(422);

        $this->patchJson('/api/v1/admin/organizations/'.$org->id, [
            'status' => 'inactive',
            'reason' => 'Client requested suspension.',
            'industry' => 'Healthcare',
        ])->assertOk()
            ->assertJsonPath('data.status', 'inactive')
            ->assertJsonPath('data.industry', 'Healthcare');
    }
}
