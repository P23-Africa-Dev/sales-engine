<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminOutreachTest extends TestCase
{
    public function test_client_user_forbidden(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/outreach/dashboard')->assertForbidden();
    }

    public function test_admin_can_load_dashboard_and_add_note(): void
    {
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);
        $org = Organization::query()->create([
            'name' => 'Dash Org',
            'slug' => 'dash-org',
            'status' => 'active',
        ]);

        $this->getJson('/api/v1/admin/outreach/dashboard')
            ->assertOk()
            ->assertJsonPath('data.source', 'live');

        $this->getJson('/api/v1/admin/outreach/organizations')->assertOk();

        $this->postJson('/api/v1/admin/organizations/'.$org->id.'/admin-notes', [
            'note' => 'Follow up with owner.',
        ])->assertCreated();

        $this->getJson('/api/v1/admin/organizations/'.$org->id.'/timeline')
            ->assertOk()
            ->assertJsonFragment(['type' => 'admin_note']);
    }
}
