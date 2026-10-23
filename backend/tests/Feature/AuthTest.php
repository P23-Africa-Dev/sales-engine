<?php

namespace Tests\Feature;

use App\Models\ExternalIdentity;
use App\Models\Organization;
use App\Models\OrganizationUser;
use App\Models\User;
use App\Services\Integrations\Factory23\Factory23CrmTokenService;
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
            app(Factory23CrmTokenService::class)->resolveToken($org)
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

    public function test_factory23_password_signs_in_an_existing_sales_engine_user(): void
    {
        $this->configureFactory23();
        $user = User::factory()->create([
            'email' => 'ada@factory.test',
            'password' => Hash::make(str()->random(40)),
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => ['id' => 44, 'email' => 'ada@factory.test', 'name' => 'Ada'],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response(['message' => 'Not found.'], 404),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'ada@factory.test',
            'password' => 'FactoryPass1!',
        ]);

        $response->assertOk()->assertJsonPath('user.email', 'ada@factory.test');
        $this->assertTrue(Hash::check('FactoryPass1!', $user->fresh()->password));
        $this->assertDatabaseHas('external_identities', [
            'provider' => 'factory23',
            'external_user_id' => '44',
            'user_id' => $user->id,
        ]);
    }

    public function test_factory23_password_provisions_an_approved_account(): void
    {
        $this->configureFactory23();

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => ['id' => 91, 'email' => 'new@factory.test', 'name' => 'New Owner'],
                ],
            ]),
            'https://api.example.com/api/v1/admin/sales-engine/access-requests/status' => Http::response([
                'data' => [
                    'status' => 'approved',
                    'request' => ['company_id' => 9, 'company_name' => 'Approved Co', 'name' => 'New Owner'],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response(['message' => 'Not found.'], 404),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'new@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertOk()->assertJsonPath('user.email', 'new@factory.test')->assertJsonPath('organization.name', 'Approved Co');
    }

    public function test_factory23_password_without_access_is_rejected(): void
    {
        $this->configureFactory23();

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => ['id' => 12, 'email' => 'waiting@factory.test', 'name' => 'Waiting'],
                ],
            ]),
            'https://api.example.com/api/v1/*/sales-engine/access-requests/status' => Http::response([
                'data' => ['status' => 'pending', 'request' => null],
            ]),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'waiting@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertForbidden()->assertJsonPath('reason', 'access_required');

        $this->assertDatabaseMissing('users', ['email' => 'waiting@factory.test']);
    }

    public function test_factory23_agent_password_signs_in_an_existing_sales_engine_user(): void
    {
        $this->configureFactory23();
        $user = User::factory()->create([
            'email' => 'agent@factory.test',
            'password' => Hash::make(str()->random(40)),
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response(['message' => 'Invalid credentials or account not activated.'], 401),
            'https://api.example.com/api/v1/agent/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'agent-token',
                    'user' => ['id' => 77, 'email' => 'agent@factory.test', 'name' => 'Field Agent'],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response(['message' => 'Not found.'], 404),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'agent@factory.test',
            'password' => 'AgentPass1!',
        ])->assertOk()->assertJsonPath('user.email', 'agent@factory.test');

        $this->assertTrue(Hash::check('AgentPass1!', $user->fresh()->password));
    }

    public function test_account_without_a_photo_gets_a_gender_avatar_or_the_ghost_default(): void
    {
        $female = User::factory()->create([
            'email' => 'owner-female@example.com',
            'password' => 'Password1!',
            'gender' => 'female',
        ]);
        $unknown = User::factory()->create([
            'email' => 'owner-unknown@example.com',
            'password' => 'Password1!',
        ]);
        $photo = User::factory()->create([
            'email' => 'owner-photo@example.com',
            'password' => 'Password1!',
            'avatar_path' => 'https://cdn.example.com/owners/ada.png',
            'gender' => 'female',
        ]);

        $femaleUrl = $this->postJson('/api/v1/auth/login', [
            'email' => $female->email,
            'password' => 'Password1!',
        ])->assertOk()->json('user.avatar_url');
        $this->assertIsString($femaleUrl);
        $this->assertStringContainsString('/avatars/female/', $femaleUrl);
        $this->postJson('/api/v1/auth/login', [
            'email' => $female->email,
            'password' => 'Password1!',
        ])->assertOk()->assertJsonPath('user.avatar_url', $femaleUrl);

        $this->postJson('/api/v1/auth/login', [
            'email' => $unknown->email,
            'password' => 'Password1!',
        ])->assertOk()->assertJsonPath('user.avatar_url', '/avatars/default-ghost.svg');

        $this->postJson('/api/v1/auth/login', [
            'email' => $photo->email,
            'password' => 'Password1!',
        ])->assertOk()->assertJsonPath('user.avatar_url', 'https://cdn.example.com/owners/ada.png');
    }

    public function test_factory23_profile_photo_is_copied_onto_the_sales_engine_user(): void
    {
        $this->configureFactory23();
        $user = User::factory()->create([
            'email' => 'photo@factory.test',
            'password' => Hash::make(str()->random(40)),
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => [
                        'id' => 44,
                        'email' => 'photo@factory.test',
                        'name' => 'Ada',
                        'avatar' => 'https://factory23-storage.lon1.digitaloceanspaces.com/avatar/default/ghost.svg',
                    ],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response([
                'data' => [
                    'identity' => [
                        'gender' => 'female',
                        'avatar_source' => 'custom_upload',
                        'avatar_url' => 'https://factory23-storage.lon1.digitaloceanspaces.com/avatar/custom/ada.png',
                    ],
                ],
            ]),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'photo@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertOk()->assertJsonPath('user.avatar_url', 'https://factory23-storage.lon1.digitaloceanspaces.com/avatar/custom/ada.png');

        $fresh = $user->fresh();
        $this->assertSame('female', $fresh->gender);
        $this->assertSame('https://factory23-storage.lon1.digitaloceanspaces.com/avatar/custom/ada.png', $fresh->avatar_path);
    }

    public function test_factory23_owner_without_a_photo_gets_a_gender_default(): void
    {
        $this->configureFactory23();
        User::factory()->create([
            'email' => 'owner@factory.test',
            'password' => Hash::make(str()->random(40)),
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => ['id' => 45, 'email' => 'owner@factory.test', 'name' => 'Owner'],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response([
                'data' => [
                    'identity' => [
                        'gender' => 'male',
                        'avatar_source' => 'none',
                        'avatar_url' => 'https://factory23-storage.lon1.digitaloceanspaces.com/avatar/default/ghost.svg',
                    ],
                ],
            ]),
        ]);

        $url = $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertOk()->json('user.avatar_url');

        $this->assertIsString($url);
        $this->assertStringContainsString('/avatars/male/', $url);
        $this->assertDatabaseHas('users', ['email' => 'owner@factory.test', 'gender' => 'male', 'avatar_path' => null]);
    }

    public function test_factory23_teammate_can_join_an_existing_workspace(): void
    {
        $this->configureFactory23();
        $org = Organization::query()->create([
            'name' => 'Shelby Global',
            'slug' => 'shelby-global',
            'f23_company_id' => '9',
        ]);
        $owner = User::factory()->create();
        OrganizationUser::query()->create([
            'organization_id' => $org->id,
            'user_id' => $owner->id,
            'role' => 'owner',
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => [
                        'id' => 55,
                        'email' => 'teammate@factory.test',
                        'name' => 'Teammate',
                        'active_company' => ['id' => 9, 'name' => 'Shelby Global'],
                    ],
                ],
            ]),
            'https://api.example.com/api/v1/*/sales-engine/access-requests/status' => Http::response([
                'data' => ['status' => 'none', 'request' => null],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response(['message' => 'Not found.'], 404),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'teammate@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertStatus(409)
            ->assertJsonPath('reason', 'organization_join')
            ->assertJsonPath('organization.name', 'Shelby Global');

        $this->assertDatabaseMissing('users', ['email' => 'teammate@factory.test']);

        $this->postJson('/api/v1/auth/factory23/join', [
            'email' => 'teammate@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertOk()
            ->assertJsonPath('user.email', 'teammate@factory.test')
            ->assertJsonPath('organization.id', $org->id)
            ->assertJsonPath('organization.name', 'Shelby Global');

        $member = User::query()->where('email', 'teammate@factory.test')->first();
        $this->assertNotNull($member);
        $this->assertDatabaseHas('organization_users', [
            'organization_id' => $org->id,
            'user_id' => $member->id,
            'role' => 'member',
        ]);
        $this->assertSame(1, Organization::query()->where('f23_company_id', '9')->count());
    }

    public function test_factory23_password_without_a_workspace_is_rejected(): void
    {
        $this->configureFactory23();

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => [
                        'id' => 56,
                        'email' => 'outsider@factory.test',
                        'name' => 'Outsider',
                        'active_company' => ['id' => 404, 'name' => 'No Workspace Co'],
                    ],
                ],
            ]),
            'https://api.example.com/api/v1/*/sales-engine/access-requests/status' => Http::response([
                'data' => ['status' => 'none', 'request' => null],
            ]),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'outsider@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertForbidden()->assertJsonPath('reason', 'access_required');

        $this->assertDatabaseMissing('users', ['email' => 'outsider@factory.test']);
        $this->assertSame(0, Organization::query()->count());
    }

    public function test_existing_sales_engine_user_signs_in_when_the_company_workspace_exists(): void
    {
        $this->configureFactory23();
        $user = User::factory()->create([
            'email' => 'ada@factory.test',
            'password' => Hash::make(str()->random(40)),
        ]);
        $org = Organization::query()->create([
            'name' => 'Shelby Global',
            'slug' => 'shelby-global',
            'f23_company_id' => '9',
        ]);
        OrganizationUser::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'role' => 'owner',
        ]);

        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response([
                'success' => true,
                'data' => [
                    'token' => 'f23-token',
                    'user' => [
                        'id' => 44,
                        'email' => 'ada@factory.test',
                        'name' => 'Ada',
                        'active_company' => ['id' => 9, 'name' => 'Shelby Global'],
                    ],
                ],
            ]),
            'https://api.example.com/api/v1/user/profile' => Http::response(['message' => 'Not found.'], 404),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'ada@factory.test',
            'password' => 'FactoryPass1!',
        ])->assertOk()->assertJsonPath('user.email', 'ada@factory.test');

        $this->assertSame(1, Organization::query()->count());
    }

    public function test_unknown_factory23_password_stays_invalid(): void
    {
        $this->configureFactory23();
        Http::fake([
            'https://api.example.com/api/v1/auth/login' => Http::response(['message' => 'Invalid credentials.'], 401),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'missing@factory.test',
            'password' => 'FactoryPass1!',
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
