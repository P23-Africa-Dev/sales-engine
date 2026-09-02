<?php

namespace App\Services\Auth;

use App\Models\ExternalIdentity;
use App\Models\Organization;
use App\Models\OrganizationUser;
use App\Models\User;
use App\Services\Integrations\Factory23\Factory23CrmTokenService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
        if (! $user || ! Hash::check($password, $user->password)) {
            return null;
        }

        $token = $user->createToken('api')->plainTextToken;
        $organization = $user->defaultOrganization();

        return compact('user', 'organization', 'token');
    }

    /**
     * @param  array{sub: string, email: string, name?: string, company_id?: string|null, company_name?: string|null}  $claims
     * @return array{user: User, organization: Organization, token: string}
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
                    $user = User::query()->create([
                        'name' => $name,
                        'email' => $email,
                        'password' => Hash::make(Str::random(40)),
                    ]);
                }

                ExternalIdentity::query()->create([
                    'user_id' => $user->id,
                    'provider' => 'factory23',
                    'external_user_id' => $externalUserId,
                    'external_company_id' => $companyId,
                    'meta' => ['email' => $email, 'name' => $name],
                ]);
            }

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
        });
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
