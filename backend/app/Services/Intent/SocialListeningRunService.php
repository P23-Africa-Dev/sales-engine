<?php

namespace App\Services\Intent;

use App\Jobs\RunSocialListeningJob;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\User;

class SocialListeningRunService
{
    public function __construct(
        private readonly SocialListeningSettingsService $settings,
    ) {}

    /**
     * @return array{id: int, status: string, bootstrapped: bool}
     */
    public function bootstrap(Organization $organization, IcpProfile $icp, ?User $user = null, bool $force = false): array
    {
        $setting = $this->settings->forIcp($organization, $icp);

        $this->failStaleQueuedRuns($organization, $icp);

        $latestRun = SocialListeningRun::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->orderByDesc('id')
            ->first();

        $inProgress = SocialListeningRun::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->where(function ($query) {
                $query->where('status', 'running')
                    ->orWhere(function ($queued) {
                        $queued->where('status', 'queued')
                            ->where('created_at', '>=', now()->subMinutes(10));
                    });
            })
            ->exists();

        if ($inProgress) {
            return [
                'id' => (int) $latestRun?->id,
                'status' => (string) ($latestRun?->status ?? 'queued'),
                'bootstrapped' => false,
            ];
        }

        $needsRun = $force
            || $setting->last_run_at === null
            || ($latestRun && $latestRun->status === 'failed');

        if (! $needsRun) {
            return [
                'id' => (int) $latestRun?->id,
                'status' => (string) ($latestRun?->status ?? 'completed'),
                'bootstrapped' => false,
            ];
        }

        if (! $force) {
            $recent = SocialListeningRun::query()
                ->where('organization_id', $organization->id)
                ->where('icp_profile_id', $icp->id)
                ->where('created_at', '>=', now()->subHour())
                ->whereIn('status', ['queued', 'running', 'completed'])
                ->exists();

            if ($recent) {
                return [
                    'id' => (int) $latestRun?->id,
                    'status' => (string) ($latestRun?->status ?? 'completed'),
                    'bootstrapped' => false,
                ];
            }
        }

        $run = SocialListeningRun::query()->create([
            'organization_id' => $organization->id,
            'icp_profile_id' => $icp->id,
            'user_id' => $user?->id,
            'status' => 'queued',
            'stages' => ['queued'],
        ]);

        RunSocialListeningJob::dispatch($run->id);

        return [
            'id' => $run->id,
            'status' => $run->status,
            'bootstrapped' => true,
        ];
    }

    public function latestRun(Organization $organization, IcpProfile $icp): ?SocialListeningRun
    {
        return SocialListeningRun::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->orderByDesc('id')
            ->first();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function formatLatestRun(?SocialListeningRun $run): ?array
    {
        if (! $run) {
            return null;
        }

        return [
            'id' => $run->id,
            'status' => $run->status,
            'stages' => $run->stages,
            'signals_created' => $run->signals_created,
            'result_summary' => $run->result_summary,
            'error' => $run->error,
            'started_at' => $run->started_at?->toIso8601String(),
            'finished_at' => $run->finished_at?->toIso8601String(),
        ];
    }

    private function failStaleQueuedRuns(Organization $organization, IcpProfile $icp): void
    {
        SocialListeningRun::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->where('status', 'queued')
            ->where('created_at', '<', now()->subMinutes(10))
            ->update([
                'status' => 'failed',
                'error' => 'Run timed out waiting for queue worker.',
                'finished_at' => now(),
            ]);
    }
}
