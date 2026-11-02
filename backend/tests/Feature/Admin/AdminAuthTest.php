<?php

namespace Tests\Feature\Admin;

use App\Models\PlatformAdmin;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAuthTest extends TestCase
{
    public function test_admin_login_returns_token(): void
    {
        PlatformAdmin::factory()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $response = $this->postJson('/api/v1/admin/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'Password1!',
        ]);

        $response->assertOk()
            ->assertJsonPath('admin.email', 'admin@example.com')
            ->assertJsonStructure(['token', 'token_type', 'admin' => ['id', 'name', 'email', 'is_active']]);
    }

    public function test_admin_login_rejects_invalid_credentials(): void
    {
        PlatformAdmin::factory()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $this->postJson('/api/v1/admin/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'wrong-password',
        ])->assertUnauthorized();
    }

    public function test_inactive_admin_cannot_login(): void
    {
        PlatformAdmin::factory()->inactive()->create([
            'email' => 'inactive@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $this->postJson('/api/v1/admin/auth/login', [
            'email' => 'inactive@example.com',
            'password' => 'Password1!',
        ])->assertForbidden();
    }

    public function test_me_requires_platform_admin(): void
    {
        $this->getJson('/api/v1/admin/auth/me')->assertUnauthorized();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/admin/auth/me')
            ->assertForbidden()
            ->assertJsonPath('message', 'Platform admin access required.');
    }

    public function test_me_returns_admin_profile(): void
    {
        $admin = PlatformAdmin::factory()->create([
            'email' => 'me@example.com',
        ]);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/auth/me')
            ->assertOk()
            ->assertJsonPath('admin.email', 'me@example.com');
    }

    public function test_inactive_admin_token_is_rejected(): void
    {
        $admin = PlatformAdmin::factory()->inactive()->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/auth/me')->assertForbidden();
    }

    public function test_logout_revokes_current_token(): void
    {
        $admin = PlatformAdmin::factory()->create([
            'email' => 'logout@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $login = $this->postJson('/api/v1/admin/auth/login', [
            'email' => 'logout@example.com',
            'password' => 'Password1!',
        ])->assertOk();

        $token = $login->json('token');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/v1/admin/auth/logout')
            ->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);

        // Clear guard state between HTTP calls in the same test app instance.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/admin/auth/me')
            ->assertUnauthorized();
    }
}
