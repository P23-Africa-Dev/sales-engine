<?php

namespace App\Services\Admin;

use App\Jobs\RunSocialListeningJob;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Intent\SocialListeningSettingsService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminSocialListeningService
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
        private readonly SocialListeningSettingsService $settings,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function overview(?int $organizationId = null): array
    {
        $base = SocialSignal::query()
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId));

        $needsReview = (clone $base)->whereNotIn('status', ['reviewed', 'dismissed'])->count();
        $approved = (clone $base)->where('status', 'reviewed')->count();
        $suppressed = (clone $base)->where('status', 'dismissed')->count();
        $synced = (clone $base)->where('status', 'synced')->count();

        $bySource = (clone $base)
            ->select('source_label')
            ->selectRaw('count(*) as total')
            ->groupBy('source_label')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'source' => $row->source_label,
                'count' => (int) $row->total,
            ])
            ->values()
            ->all();

        $pausedOrgs = SocialListeningSetting::query()
            ->whereNotNull('admin_paused_at')
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))
            ->distinct()
            ->count('organization_id');

        return [
            'totals' => [
                'signals' => (clone $base)->count(),
                'needs_review' => $needsReview,
                'approved' => $approved,
                'suppressed' => $suppressed,
                'synced' => $synced,
                'paused_organizations' => $pausedOrgs,
            ],
            'by_source' => $bySource,
            'status_map' => [
                'Needs review' => 'new',
                'Approved' => 'reviewed',
                'Suppressed' => 'dismissed',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginateSignals(array $filters): LengthAwarePaginator
    {
        $query = SocialSignal::query()->with(['organization', 'icpProfile', 'lead']);

        if (! empty($filters['organization_id'])) {
            $query->where('organization_id', (int) $filters['organization_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(function (Builder $q) use ($term) {
                $q->where('post_text', 'like', $term)
                    ->orWhere('company_name', 'like', $term)
                    ->orWhere('persona', 'like', $term)
                    ->orWhere('intent_label', 'like', $term);
            });
        }

        if (! empty($filters['source']) && $filters['source'] !== 'all') {
            $query->where(function (Builder $q) use ($filters) {
                $q->where('source_label', $filters['source'])
                    ->orWhere('platform', $filters['source']);
            });
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $status = $this->mapUiStatus((string) $filters['status']);
            if (in_array($status, ['needs_review'], true) || $filters['status'] === 'Needs review') {
                $query->whereNotIn('status', ['reviewed', 'dismissed']);
            } else {
                $query->where('status', $status);
            }
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        return $query->orderByDesc('score')->orderByDesc('id')->paginate($perPage);
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function exportSignals(array $filters): StreamedResponse
    {
        $filters['per_page'] = 10000;
        $page = $this->paginateSignals($filters);

        return response()->streamDownload(function () use ($page) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['id', 'organization_id', 'company_name', 'source', 'status', 'score', 'intent_label', 'posted_at']);
            foreach ($page->items() as $signal) {
                /** @var SocialSignal $signal */
                fputcsv($out, [
                    $signal->id,
                    $signal->organization_id,
                    $signal->company_name,
                    $signal->source_label,
                    $signal->status,
                    $signal->score,
                    $signal->intent_label,
                    $signal->posted_at?->toIso8601String(),
                ]);
            }
            fclose($out);
        }, 'admin-social-signals.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    /**
     * @param  list<int>  $ids
     * @return array{updated: int}
     */
    public function reviewSignals(PlatformAdmin $admin, array $ids, string $status, string $reason): array
    {
        $mapped = $this->mapUiStatus($status);
        if (! in_array($mapped, ['reviewed', 'dismissed', 'new'], true)) {
            throw ValidationException::withMessages(['status' => 'Status must be reviewed, dismissed, or new.']);
        }

        $signals = SocialSignal::query()->whereIn('id', $ids)->get();
        $updated = 0;

        foreach ($signals as $signal) {
            $previous = $signal->status;
            $signal->status = $mapped;
            $signal->save();
            $updated++;

            $this->audit->log(
                $admin,
                'Social signal reviewed',
                $reason,
                $signal->organization_id,
                $signal,
                ['status' => $mapped, 'previous' => $previous],
            );
        }

        return ['updated' => $updated];
    }

    public function settingsForOrganization(Organization $organization): SocialListeningSetting
    {
        $icp = $organization->activeIcpProfile
            ?? IcpProfile::query()
                ->where('organization_id', $organization->id)
                ->orderByDesc('is_active')
                ->orderByDesc('id')
                ->first();

        if (! $icp) {
            throw ValidationException::withMessages([
                'icp_profile' => 'Organization has no ICP profile for social listening settings.',
            ]);
        }

        return $this->settings->forIcp($organization, $icp);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateSettings(PlatformAdmin $admin, Organization $organization, array $data): SocialListeningSetting
    {
        $icp = $organization->activeIcpProfile
            ?? IcpProfile::query()->where('organization_id', $organization->id)->orderByDesc('id')->firstOrFail();

        $setting = $this->settings->update($organization, $icp, $data);

        $this->audit->log(
            $admin,
            'Social listening settings updated',
            $data['reason'] ?? 'Updated social listening settings.',
            $organization->id,
            $setting,
            ['changes' => array_keys($data)],
        );

        return $setting->fresh();
    }

    public function pause(PlatformAdmin $admin, Organization $organization, ?string $reason = null): SocialListeningSetting
    {
        $setting = $this->settingsForOrganization($organization);

        SocialListeningSetting::query()
            ->where('organization_id', $organization->id)
            ->update(['admin_paused_at' => now()]);

        $this->audit->log(
            $admin,
            'Social listening paused',
            $reason ?? 'Paused by platform admin.',
            $organization->id,
            $setting,
        );

        return $setting->fresh();
    }

    public function resume(PlatformAdmin $admin, Organization $organization, ?string $reason = null): SocialListeningSetting
    {
        $setting = $this->settingsForOrganization($organization);

        SocialListeningSetting::query()
            ->where('organization_id', $organization->id)
            ->update(['admin_paused_at' => null]);

        $this->audit->log(
            $admin,
            'Social listening resumed',
            $reason ?? 'Resumed by platform admin.',
            $organization->id,
            $setting,
        );

        return $setting->fresh();
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginateRuns(array $filters): LengthAwarePaginator
    {
        $query = SocialListeningRun::query()->with(['organization', 'icpProfile']);

        if (! empty($filters['organization_id'])) {
            $query->where('organization_id', (int) $filters['organization_id']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        return $query->orderByDesc('id')->paginate($perPage);
    }

    /**
     * @return array{id: int, status: string}
     */
    public function queueRun(PlatformAdmin $admin, Organization $organization, ?int $icpProfileId = null, bool $force = false): array
    {
        $icp = $icpProfileId
            ? IcpProfile::query()->where('organization_id', $organization->id)->findOrFail($icpProfileId)
            : ($organization->activeIcpProfile
                ?? IcpProfile::query()->where('organization_id', $organization->id)->orderByDesc('id')->firstOrFail());

        $paused = SocialListeningSetting::query()
            ->where('organization_id', $organization->id)
            ->whereNotNull('admin_paused_at')
            ->exists();

        if ($paused && ! $force) {
            throw ValidationException::withMessages([
                'organization' => 'Social listening is paused for this organization. Resume or pass force=true.',
            ]);
        }

        $run = SocialListeningRun::query()->create([
            'organization_id' => $organization->id,
            'icp_profile_id' => $icp->id,
            'user_id' => null,
            'status' => 'queued',
            'stages' => ['queued'],
        ]);

        RunSocialListeningJob::dispatch($run->id);

        $this->audit->log(
            $admin,
            'Social listening run queued',
            'Platform admin queued a social listening run.',
            $organization->id,
            $run,
            ['icp_profile_id' => $icp->id, 'force' => $force],
        );

        return ['id' => $run->id, 'status' => $run->status];
    }

    /**
     * @return array{id: int, status: string}
     */
    public function retryRun(PlatformAdmin $admin, SocialListeningRun $run): array
    {
        $retry = SocialListeningRun::query()->create([
            'organization_id' => $run->organization_id,
            'icp_profile_id' => $run->icp_profile_id,
            'user_id' => null,
            'status' => 'queued',
            'stages' => ['queued'],
            'result_summary' => ['retried_from' => $run->id],
        ]);

        RunSocialListeningJob::dispatch($retry->id);

        $this->audit->log(
            $admin,
            'Social listening run retried',
            'Platform admin retried a social listening run.',
            $run->organization_id,
            $retry,
            ['retried_from' => $run->id],
        );

        return ['id' => $retry->id, 'status' => $retry->status];
    }

    private function mapUiStatus(string $status): string
    {
        return match ($status) {
            'Needs review', 'needs_review' => 'needs_review',
            'Approved', 'approved', 'reviewed' => 'reviewed',
            'Suppressed', 'suppressed', 'dismissed' => 'dismissed',
            'new' => 'new',
            default => $status,
        };
    }
}
