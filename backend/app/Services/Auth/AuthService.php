<?php

namespace App\Services\Auth;

use App\Exceptions\AccessRequiredException;
use App\Models\ExternalIdentity;
use App\Models\Organization;
use App\Models\OrganizationUser;
use App\Models\User;
use App\Services\Integrations\Factory23\Factory23CrmTokenService;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AuthService
{
    public function __construct(private readonly Factory23CrmTokenService $crmTokenService) {}

    /**
     * @return array{user: User, organization: Organization, token: string}
     */
    public function register(string $name, string $email, string $password, ?string $organizationName = null): array
    {
        return DB::transaction(function () use ($name, $email, $password, $organizationName) {
            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'password' => $password,
            ]);

            $orgName = $organizationName ?: ($name."'s Workspace");
            $organization = $this->createOrganization($orgName);
            $this->attachOwner($organization, $user);

            $token = $user->createToken('api')->plainTextToken;

            return compact('user', 'organization', 'token');
        });
    }

    /**
     * @return array{user: User, organization: Organization|null, token: string}|null
     */
    public function login(string $email, string $password): ?array
    {
        $user = User::query()->where('email', $email)->first();
        if ($user && Hash::check($password, $user->password)) {
            return $this->issueSession($user);
        }

        return $this->loginWithFactory23Password($email, $password);
    }

    /**
     * @return array{user: User, organization: Organization|null, token: string}
     */
    private function issueSession(User $user): array
    {
        $token = $user->createToken('api')->plainTextToken;
        $organization = $user->defaultOrganization();

        return compact('user', 'organization', 'token');
    }

    /**
     * Factory23 members who already have Sales Engine access sign in with that password.
     * Provisioned accounts are created with a random password, so the Factory23 password
     * is checked and then stored on the Sales Engine user.
     *
     * @return array{user: User, organization: Organization|null, token: string}|null
     *
     * @throws AccessRequiredException
     */
    private function loginWithFactory23Password(string $email, string $password): ?array
    {
        $base = rtrim((string) config('services.factory23.api_url'), '/');
        if ($base === '') {
            return null;
        }

        $login = $this->factory23PasswordLogin($base, $email, $password);
        if ($login === null) {
            return null;
        }

        $token = (string) ($login->json('data.token') ?? '');
        $profile = $login->json('data.user');
        if ($token === '' || ! is_array($profile)) {
            return null;
        }

        $externalId = (string) ($profile['id'] ?? '');
        $profileEmail = (string) ($profile['email'] ?? $email);
        $identity = $externalId !== ''
            ? ExternalIdentity::query()->where('provider', 'factory23')->where('external_user_id', $externalId)->first()
            : null;
        $user = $identity?->user
            ?? User::query()->where('email', $email)->orWhere('email', $profileEmail)->first();

        if (! $user) {
            $access = $this->factory23Access($base, $token);
            if (($access['status'] ?? '') !== 'approved') {
                throw new AccessRequiredException('This Factory23 account does not have Sales Engine access yet.');
            }

            $request = is_array($access['request'] ?? null) ? $access['request'] : [];
            $provisioned = $this->provisionFactory23User([
                'sub' => $externalId !== '' ? $externalId : $email,
                'email' => (string) ($profile['email'] ?? $email),
                'name' => (string) ($profile['name'] ?? $request['name'] ?? 'Factory23 User'),
                'company_id' => isset($request['company_id']) ? (string) $request['company_id'] : null,
                'company_name' => (string) ($request['company_name'] ?? 'Factory23 Company'),
            ]);
            $user = $provisioned['user'];
        }

        $user->password = $password;
        if ($user->email_verified_at === null) {
            $user->email_verified_at = now();
        }
        $user->save();

        if ($externalId !== '') {
            $this->linkFactory23Identity($user, $externalId, $profile);
        }

        return $this->issueSession($user->fresh() ?? $user);
    }

    /**
     * @param  array<string, mixed>  $profile
     */
    private function linkFactory23Identity(User $user, string $externalId, array $profile): void
    {
        $identity = ExternalIdentity::query()
            ->where('provider', 'factory23')
            ->where('external_user_id', $externalId)
            ->first();

        if ($identity && (int) $identity->user_id !== (int) $user->id) {
            return;
        }

        ExternalIdentity::query()->updateOrCreate(
            ['provider' => 'factory23', 'external_user_id' => $externalId],
            [
                'user_id' => $user->id,
                'meta' => [
                    'email' => (string) ($profile['email'] ?? $user->email),
                    'name' => (string) ($profile['name'] ?? $user->name),
                    'linked_via' => 'factory23_password',
                ],
            ],
        );
    }

    private function factory23PasswordLogin(string $base, string $email, string $password): ?Response
    {
        foreach (['/api/v1/auth/login', '/api/v1/agent/login'] as $path) {
            try {
                $login = Http::acceptJson()->timeout(15)->post($base.$path, [
                    'email' => $email,
                    'password' => $password,
                ]);
            } catch (\Throwable $e) {
                Log::warning('Factory23 login could not be reached from Sales Engine.', ['error' => $e->getMessage()]);

                return null;
            }

            if ($login->successful()) {
                return $login;
            }

            if ($login->status() === 429) {
                return null;
            }
        }

        return null;
    }

    /**
     * @return array{status: string, request: array<string, mixed>|null}
     */
    private function factory23Access(string $base, string $token): array
    {
        foreach (['/api/v1/admin/sales-engine/access-requests/status', '/api/v1/agent/sales-engine/access-requests/status'] as $path) {
            try {
                $response = Http::withToken($token)->acceptJson()->timeout(15)->get($base.$path);
            } catch (\Throwable $e) {
                Log::warning('Factory23 access status could not be reached.', ['error' => $e->getMessage()]);

                continue;
            }

            if (! $response->successful()) {
                continue;
            }

            return [
                'status' => (string) $response->json('data.status', ''),
                'request' => $response->json('data.request'),
            ];
        }

        return ['status' => '', 'request' => null];
    }

    /**
     * Exchange a Factory23 assertion for a Sales Engine session.
     * Does NOT auto-create users — they must already exist (same email or linked identity),
     * or be provisioned via {@see provisionFactory23User} after Control approval.
     *
     * @param  array{sub: string, email: string, name?: string, company_id?: string|null, company_name?: string|null}  $claims
     * @return array{user: User, organization: Organization, token: string}
     *
     * @throws AccessRequiredException
     */
    public function exchangeFactory23(array $claims, ?string $f23AccessToken = null): array
    {
        return DB::transaction(function () use ($claims, $f23AccessToken) {
            $externalUserId = (string) $claims['sub'];
            $email = (string) $claims['email'];
            $name = (string) ($claims['name'] ?? 'Factory23 User');
            $companyId = isset($claims['company_id']) ? (string) $claims['company_id'] : null;
            $companyName = (string) ($claims['company_name'] ?? 'Factory23 Company');

            $identity = ExternalIdentity::query()
                ->where('provider', 'factory23')
                ->where('external_user_id', $externalUserId)
                ->first();

            if ($identity) {
                $user = $identity->user;
                $identity->update([
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $email, 'name' => $name],
                ]);
            } else {
                $user = User::query()->where('email', $email)->first();
                if (! $user) {
                    throw new AccessRequiredException(
                        'No Sales Engine account is linked to this Factory23 user.'
                    );
                }

                ExternalIdentity::query()->create([
                    'user_id' => $user->id,
                    'provider' => 'factory23',
                    'external_user_id' => $externalUserId,
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $email, 'name' => $name],
                ]);
            }

            // TODO: enforce active Sales Engine subscription before issuing a session.
            $this->assertSubscriptionAllowsAccess($user);

            return $this->finalizeFactory23Session($user, $companyId, $companyName, $f23AccessToken);
        });
    }

    /**
     * Provision a Sales Engine user from a Control-approved Factory23 access request.
     * Idempotent when the F23 identity or email already exists.
     *
     * @param  array{sub: string, email: string, name?: string, company_id?: string|null, company_name?: string|null}  $claims
     * @return array{user: User, organization: Organization, created: bool}
     */
    public function provisionFactory23User(array $claims): array
    {
        return DB::transaction(function () use ($claims) {
            $externalUserId = (string) $claims['sub'];
            $email = (string) $claims['email'];
            $name = (string) ($claims['name'] ?? 'Factory23 User');
            $companyId = isset($claims['company_id']) ? (string) $claims['company_id'] : null;
            $companyName = (string) ($claims['company_name'] ?? 'Factory23 Company');

            $identity = ExternalIdentity::query()
                ->where('provider', 'factory23')
                ->where('external_user_id', $externalUserId)
                ->first();

            $created = false;

            if ($identity) {
                $user = $identity->user;
                $identity->update([
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $email, 'name' => $name],
                ]);
            } else {
                $user = User::query()->where('email', $email)->first();
                if (! $user) {
                    $user = User::query()->create([
                        'name' => $name,
                        'email' => $email,
                        'password' => Hash::make(Str::random(40)),
                    ]);
                    $created = true;
                }

                ExternalIdentity::query()->create([
                    'user_id' => $user->id,
                    'provider' => 'factory23',
                    'external_user_id' => $externalUserId,
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $email, 'name' => $name],
                ]);
            }

            $session = $this->finalizeFactory23Session($user, $companyId, $companyName, null);

            return [
                'user' => $session['user'],
                'organization' => $session['organization'],
                'created' => $created,
            ];
        });
    }

    /**
     * Authenticate with Sales Engine credentials and link the Factory23 identity
     * (covers F23 email ≠ SE email). Returns a Factory23-scoped Sanctum token.
     *
     * @param  array{sub: string, email: string, name?: string, company_id?: string|null, company_name?: string|null}  $claims
     * @return array{user: User, organization: Organization, token: string}|null
     */
    public function linkFactory23Login(array $claims, string $email, string $password, ?string $f23AccessToken = null): ?array
    {
        $user = User::query()->where('email', $email)->first();
        if (! $user || ! Hash::check($password, $user->password)) {
            return null;
        }

        return DB::transaction(function () use ($claims, $user, $f23AccessToken) {
            $externalUserId = (string) $claims['sub'];
            $claimEmail = (string) $claims['email'];
            $name = (string) ($claims['name'] ?? $user->name);
            $companyId = isset($claims['company_id']) ? (string) $claims['company_id'] : null;
            $companyName = (string) ($claims['company_name'] ?? 'Factory23 Company');

            $existingForSub = ExternalIdentity::query()
                ->where('provider', 'factory23')
                ->where('external_user_id', $externalUserId)
                ->first();

            if ($existingForSub && (int) $existingForSub->user_id !== (int) $user->id) {
                $existingForSub->delete();
            }

            $identity = ExternalIdentity::query()
                ->where('provider', 'factory23')
                ->where('external_user_id', $externalUserId)
                ->first();

            if ($identity) {
                $identity->update([
                    'user_id' => $user->id,
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $claimEmail, 'name' => $name, 'linked_via' => 'password'],
                ]);
            } else {
                ExternalIdentity::query()->create([
                    'user_id' => $user->id,
                    'provider' => 'factory23',
                    'external_user_id' => $externalUserId,
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $claimEmail, 'name' => $name, 'linked_via' => 'password'],
                ]);
            }

            // TODO: enforce active Sales Engine subscription before issuing a session.
            $this->assertSubscriptionAllowsAccess($user);

            return $this->finalizeFactory23Session($user, $companyId, $companyName, $f23AccessToken);
        });
    }

    /**
     * Subscription / paid-plan gate — locked open for now.
     */
    private function assertSubscriptionAllowsAccess(User $user): void
    {
        // Intentionally a no-op until Sales Engine billing is wired.
        unset($user);
    }

    /**
     * @return array{user: User, organization: Organization, token: string}
     */
    private function finalizeFactory23Session(
        User $user,
        ?string $companyId,
        string $companyName,
        ?string $f23AccessToken,
    ): array {
        $organization = null;
        if ($companyId) {
            $organization = Organization::query()->where('f23_company_id', $companyId)->first();
        }

        if (! $organization) {
            $organization = $user->defaultOrganization();
        }

        if (! $organization) {
            $organization = $this->createOrganization($companyName, $companyId);
        } elseif ($companyId && ! $organization->f23_company_id) {
            $organization->update(['f23_company_id' => $companyId]);
        }

        if ($companyId && filled($organization->f23_company_id) && config('services.factory23.crm_sync_enabled')) {
            $organization->update(['factory23_crm_sync_enabled' => true]);
        }

        if (filled($f23AccessToken) && filled($organization->f23_company_id)) {
            $this->crmTokenService->registerForOrganization($organization, $f23AccessToken);
            $organization = $organization->fresh();
        }

        if (! OrganizationUser::query()->where('organization_id', $organization->id)->where('user_id', $user->id)->exists()) {
            $this->attachOwner($organization, $user);
        }

        $token = $user->createToken('factory23')->plainTextToken;

        return compact('user', 'organization', 'token');
    }

    public function createOrganization(string $name, ?string $f23CompanyId = null): Organization
    {
        $base = Str::slug($name) ?: 'org';
        $slug = $base;
        $i = 1;
        while (Organization::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return Organization::query()->create([
            'name' => $name,
            'slug' => $slug,
            'f23_company_id' => $f23CompanyId,
        ]);
    }

    public function attachOwner(Organization $organization, User $user): void
    {
        OrganizationUser::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => 'owner',
        ]);
    }
}
