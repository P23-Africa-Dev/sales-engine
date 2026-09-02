<?php

namespace App\Jobs;

use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Services\Intent\SocialListeningOrchestrator;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class RunSocialListeningJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

    public function __construct(public int $runId) {}

    public function handle(SocialListeningOrchestrator $orchestrator): void
    {
        $run = SocialListeningRun::query()->with(['organization', 'icpProfile'])->find($this->runId);
        if (! $run || ! $run->organization || ! $run->icpProfile) {
            return;
        }

        $settings = SocialListeningSetting::query()
            ->where('organization_id', $run->organization_id)
            ->where('icp_profile_id', $run->icp_profile_id)
            ->first();

        if (! $settings) {
            $settings = SocialListeningSetting::query()->create(
                SocialListeningSetting::defaultsForOrg($run->organization_id, $run->icp_profile_id)
            );
        }

        try {
            $orchestrator->run($run->organization, $run->icpProfile, $settings, null, $run);
        } catch (\Throwable $e) {
            Log::error('Social listening job failed', ['run_id' => $this->runId, 'error' => $e->getMessage()]);
            $run->update(['status' => 'failed', 'error' => $e->getMessage(), 'finished_at' => now()]);
        }
    }
}
