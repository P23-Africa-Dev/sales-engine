<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_register_creates_user_org_and_token(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
            'organization_name' => 'Analytical Engines',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.email', 'ada@example.com')
            ->assertJsonPath('organization.name', 'Analytical Engines')
            ->assertJsonStructure(['token', 'token_type', 'user', 'organization']);

        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
        $this->assertDatabaseHas('organizations', ['name' => 'Analytical Engines']);
    }

    public function test_login_returns_token(): void
    {
        User::factory()->create([
            'email' => 'login@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login@example.com',
            'password' => 'Password1!',
        ]);

        $response->assertOk()->assertJsonStructure(['token', 'user']);
    }

    public function test_me_requires_auth(): void
    {
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_factory23_exchange_upserts_user(): void
    {
        config([
            'services.factory23.jwt_secret' => 'test-secret-key-at-least-32-bytes-long!!',
            'services.factory23.crm_sync_enabled' => true,
            'services.factory23.api_url' => 'https://api.example.com',
        ]);

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['items' => [['slug' => 'new_lead']]]], 200),
        ]);

        $assertion = JWT::encode([
            'sub' => 'f23-user-1',
            'email' => 'f23@example.com',
            'name' => 'F23 User',
            'company_id' => 'f23-co-9',
            'company_name' => 'F23 Co',
            'exp' => time() + 60,
        ], 'test-secret-key-at-least-32-bytes-long!!', 'HS256');

        $response = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $assertion,
            'f23_access_token' => 'f23-user-token',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'f23@example.com')
            ->assertJsonPath('organization.f23_company_id', 'f23-co-9')
            ->assertJsonPath('organization.factory23_crm_sync_enabled', true);

        $this->assertDatabaseHas('external_identities', [
            'provider' => 'factory23',
            'external_user_id' => 'f23-user-1',
        ]);

        $org = Organization::query()->where('f23_company_id', 'f23-co-9')->first();
        $this->assertNotNull($org);
        $this->assertSame(
            'f23-user-token',
            app(\App\Services\Integrations\Factory23\Factory23CrmTokenService::class)->resolveToken($org)
        );
    }
}
