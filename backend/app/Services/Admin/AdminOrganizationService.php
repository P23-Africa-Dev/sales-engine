<?php

namespace App\Services\Admin;

use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\User;
use App\Services\Auth\AuthService;
use App\Services\Auth\InvitationService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class AdminOrganizationService
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly InvitationService $invitations,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters): LengthAwarePaginator
    {
        $query = Organization::query()
            ->with(['users' => fn ($q) => $q->wherePivot('role', 'owner')])
            ->withCount(['leads', 'companies']);

        if ($search = trim((string) ($filters['search'] ?? ''))) {
            $query->where(function (Builder $builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('industry', 'like', "%{$search}%")
                    ->orWhereHas('users', function (Builder $users) use ($search) {
                        $users->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if (! empty($filters['industry'])) {
            $query->where('industry', $filters['industry']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['pool'])) {
            match ($filters['pool']) {
                'lt_1000' => $query->having('leads_count', '<', 1000),
                '1000_2999' => $query->having('leads_count', '>=', 1000)->having('leads_count', '<=', 2999),
                'gte_3000' => $query->having('leads_count', '>=', 3000),
                default => null,
            };
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 6)));

        return $query->orderByDesc('id')->paginate($perPage);
    }

    public function find(int $id): Organization
    {
        return Organization::query()
            ->with(['users' => fn ($q) => $q->wherePivot('role', 'owner')])
            ->withCount(['leads', 'companies'])
            ->findOrFail($id);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{organization: Organization, invitation_email: string}
     */
    public function create(PlatformAdmin $admin, array $data): array
    {
        return DB::transaction(function () use ($admin, $data) {
            $org = $this->auth->createOrganization($data['name']);
            $org->fill([
                'industry' => $data['industry'] ?? null,
                'country' => $data['country'] ?? null,
                'purpose' => $data['scope'] ?? $data['purpose'] ?? null,
                'status' => $data['status'] ?? 'pending',
            ])->save();

            $ownerEmail = mb_strtolower(trim($data['owner_email']));
            $this->invitations->createFromPlatformAdmin($org, $admin, $ownerEmail, 'owner');

            $this->audit->log(
                $admin,
                'Organization provisioned',
                $data['reason'] ?? 'Platform admin created organization and invited owner.',
                $org->id,
                $org,
                ['owner_email' => $ownerEmail],
            );

            return [
                'organization' => $this->find($org->id),
                'invitation_email' => $ownerEmail,
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(PlatformAdmin $admin, Organization $organization, array $data): Organization
    {
        $beforeStatus = $organization->status;

        $organization->fill(collect($data)->only([
            'name',
            'industry',
            'country',
            'status',
            'purpose',
            'team_size',
            'search_limit_monthly',
            'outreach_email_limit_monthly',
            'enrichment_limit_monthly',
            'crm_stale_days',
        ])->filter(fn ($v) => $v !== null)->all())->save();

        if (isset($data['scope'])) {
            $organization->purpose = $data['scope'];
            $organization->save();
        }

        $reason = $data['reason'] ?? null;
        if (($data['status'] ?? null) && $data['status'] !== $beforeStatus && ! $reason) {
            $reason = "Status changed from {$beforeStatus} to {$data['status']}.";
        }

        $this->audit->log(
            $admin,
            'Organization updated',
            $reason,
            $organization->id,
            $organization,
            ['changes' => array_keys($data)],
        );

        return $this->find($organization->id);
    }

    public function ownerName(Organization $organization): ?string
    {
        /** @var User|null $owner */
        $owner = $organization->users->first();

        return $owner?->name;
    }

    public function ownerEmail(Organization $organization): ?string
    {
        /** @var User|null $owner */
        $owner = $organization->users->first();

        return $owner?->email;
    }
}
