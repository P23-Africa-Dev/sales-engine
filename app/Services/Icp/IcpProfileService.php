<?php

namespace App\Services\Icp;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Intent\SocialListeningRunService;
use App\Services\Intent\SocialListeningSettingsService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class IcpProfileService
{
    public function __construct(
        private readonly SocialListeningSettingsService $socialSettings,
        private readonly SocialListeningRunService $socialRuns,
    ) {}
    public function list(Organization $organization): Collection
    {
        return IcpProfile::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();
    }

    public function active(Organization $organization): ?IcpProfile
    {
        return IcpProfile::query()
            ->where('organization_id', $organization->id)
            ->where('is_active', true)
            ->first();
    }

    public function create(Organization $organization, array $data): IcpProfile
    {
        return DB::transaction(function () use ($organization, $data) {
            $config = array_merge(IcpProfile::defaultConfig(), $data['config'] ?? []);
            $isFirst = ! IcpProfile::query()->where('organization_id', $organization->id)->exists();

            $profile = IcpProfile::query()->create([
                'organization_id' => $organization->id,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'is_active' => $isFirst,
                'config' => $config,
            ]);

            return $profile;
        });
    }

    public function update(IcpProfile $profile, array $data): IcpProfile
    {
        if (isset($data['name'])) {
            $profile->name = $data['name'];
        }
        if (array_key_exists('description', $data)) {
            $profile->description = $data['description'];
        }
        if (isset($data['config']) && is_array($data['config'])) {
            $profile->config = array_merge($profile->config ?? IcpProfile::defaultConfig(), $data['config']);
        }
        $profile->save();

        return $profile->fresh();
    }

    public function activate(IcpProfile $profile): IcpProfile
    {
        return DB::transaction(function () use ($profile) {
            IcpProfile::query()
                ->where('organization_id', $profile->organization_id)
                ->where('id', '!=', $profile->id)
                ->update(['is_active' => false]);

            $profile->is_active = true;
            $profile->save();

            $organization = Organization::query()->find($profile->organization_id);
            if ($organization) {
                $this->socialSettings->forIcp($organization, $profile);
                $this->socialRuns->bootstrap($organization, $profile);
            }

            return $profile->fresh();
        });
    }

    public function duplicate(IcpProfile $profile): IcpProfile
    {
        return IcpProfile::query()->create([
            'organization_id' => $profile->organization_id,
            'name' => $profile->name.' (Copy)',
            'description' => $profile->description,
            'is_active' => false,
            'lead_count' => 0,
            'config' => $profile->config,
        ]);
    }

    public function delete(IcpProfile $profile): void
    {
        DB::transaction(function () use ($profile) {
            $wasActive = $profile->is_active;
            $orgId = $profile->organization_id;
            $profile->delete();

            if ($wasActive) {
                $next = IcpProfile::query()
                    ->where('organization_id', $orgId)
                    ->orderBy('id')
                    ->first();
                if ($next) {
                    $next->update(['is_active' => true]);
                }
            }
        });
    }
}
