<?php

namespace Tests\Feature;

use App\Models\ExternalIdentity;
use App\Models\Organization;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AuthTest extends TestCase
{
    private string $jwtSecret = 'test-secret-key-at-least-32-bytes-long!!';

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

    public function test_factory23_exchange_denies_unknown_user(): void
    {
        $this->configureFactory23();

        $response = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-user-new',
                'email' => 'unknown@example.com',
            ]),
        ]);

        $response->assertForbidden()
            ->assertJsonPath('reason', 'access_required');

        $this->assertDatabaseMissing('users', ['email' => 'unknown@example.com']);
        $this->assertDatabaseMissing('external_identities', [
            'provider' => 'factory23',
            'external_user_id' => 'f23-user-new',
        ]);
    }

    public function test_factory23_exchange_links_existing_email_user(): void
    {
        $this->configureFactory23();

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['items' => [['slug' => 'new_lead']]]], 200),
        ]);

        User::factory()->create([
            'email' => 'f23@example.com',
            'name' => 'Existing SE User',
            'password' => Hash::make('Password1!'),
        ]);

        $response = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-user-1',
                'email' => 'f23@example.com',
                'name' => 'F23 User',
                'company_id' => 'f23-co-9',
                'company_name' => 'F23 Co',
            ]),
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

    public function test_factory23_exchange_uses_linked_identity(): void
    {
        $this->configureFactory23();

        $user = User::factory()->create([
            'email' => 'linked@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        ExternalIdentity::query()->create([
            'user_id' => $user->id,
            'provider' => 'factory23',
            'external_user_id' => 'f23-linked-1',
            'external_company_id' => 'co-1',
            'meta' => ['email' => 'other@factory23.com', 'name' => 'Linked'],
        ]);

        $response = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-linked-1',
                'email' => 'other@factory23.com',
                'name' => 'Linked',
                'company_id' => 'co-1',
                'company_name' => 'Co',
            ]),
        ]);

        $response->assertOk()->assertJsonPath('user.email', 'linked@example.com');
    }

    public function test_factory23_provision_creates_user(): void
    {
        config(['services.factory23.internal_token' => 'provision-secret']);

        $response = $this->postJson('/api/v1/auth/factory23/provision', [
            'sub' => 'f23-prov-1',
            'email' => 'provisioned@example.com',
            'name' => 'Provisioned User',
            'company_id' => 'co-prov',
            'company_name' => 'Prov Co',
        ], [
            'X-Internal-Token' => 'provision-secret',
        ]);

        $response->assertCreated()
            ->assertJsonPath('created', true)
            ->assertJsonPath('user.email', 'provisioned@example.com');

        $this->assertDatabaseHas('external_identities', [
            'provider' => 'factory23',
            'external_user_id' => 'f23-prov-1',
        ]);

        // After provision, exchange succeeds.
        $this->configureFactory23();
        $exchange = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-prov-1',
                'email' => 'provisioned@example.com',
            ]),
        ]);
        $exchange->assertOk();
    }

    public function test_factory23_provision_requires_internal_token(): void
    {
        config(['services.factory23.internal_token' => 'provision-secret']);

        $this->postJson('/api/v1/auth/factory23/provision', [
            'sub' => 'x',
            'email' => 'x@example.com',
        ])->assertUnauthorized();
    }

    public function test_factory23_login_link_links_different_email(): void
    {
        $this->configureFactory23();

        User::factory()->create([
            'email' => 'se-account@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $response = $this->postJson('/api/v1/auth/factory23/login-link', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-diff-email',
                'email' => 'f23-other@example.com',
                'name' => 'F23 Other',
                'company_id' => 'co-diff',
                'company_name' => 'Diff Co',
            ]),
            'email' => 'se-account@example.com',
            'password' => 'Password1!',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'se-account@example.com');

        $this->assertDatabaseHas('external_identities', [
            'provider' => 'factory23',
            'external_user_id' => 'f23-diff-email',
        ]);

        // Subsequent SSO exchange with F23 email works via linked identity.
        $exchange = $this->postJson('/api/v1/auth/factory23/exchange', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-diff-email',
                'email' => 'f23-other@example.com',
            ]),
        ]);
        $exchange->assertOk()->assertJsonPath('user.email', 'se-account@example.com');
    }

    public function test_factory23_login_link_rejects_bad_password(): void
    {
        $this->configureFactory23();

        User::factory()->create([
            'email' => 'se-account@example.com',
            'password' => Hash::make('Password1!'),
        ]);

        $this->postJson('/api/v1/auth/factory23/login-link', [
            'assertion' => $this->makeAssertion([
                'sub' => 'f23-bad-pw',
                'email' => 'f23@example.com',
            ]),
            'email' => 'se-account@example.com',
            'password' => 'WrongPassword!',
        ])->assertUnauthorized();
    }

    private function configureFactory23(): void
    {
        config([
            'services.factory23.jwt_secret' => $this->jwtSecret,
            'services.factory23.crm_sync_enabled' => true,
            'services.factory23.api_url' => 'https://api.example.com',
        ]);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function makeAssertion(array $claims): string
    {
        return JWT::encode(array_merge([
            'exp' => time() + 60,
        ], $claims), $this->jwtSecret, 'HS256');
    }
}
