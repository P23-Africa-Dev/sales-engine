<?php

namespace App\Console\Commands;

use App\Jobs\RunSocialListeningJob;
use App\Models\IcpProfile;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use Illuminate\Console\Command;

class DispatchDueSocialListeningCommand extends Command
{
    protected $signature = 'social-listening:dispatch-due';

    protected $description = 'Enqueue social listening runs for ICPs past their refresh cadence';

    public function handle(): int
    {
        $settings = SocialListeningSetting::query()
            ->with('icpProfile')
            ->get();

        $dispatched = 0;

        foreach ($settings as $setting) {
            if (! $setting->icpProfile || ! $setting->icpProfile->is_active) {
                continue;
            }

            $due = ! $setting->last_run_at
                || $setting->last_run_at->lte(now()->subDays($setting->cadence_days));

            if (! $due) {
                continue;
            }

            $running = SocialListeningRun::query()
                ->where('organization_id', $setting->organization_id)
                ->where('icp_profile_id', $setting->icp_profile_id)
                ->whereIn('status', ['queued', 'running'])
                ->exists();

            if ($running) {
                continue;
            }

            $run = SocialListeningRun::query()->create([
                'organization_id' => $setting->organization_id,
                'icp_profile_id' => $setting->icp_profile_id,
                'status' => 'queued',
                'stages' => ['queued'],
            ]);

            RunSocialListeningJob::dispatch($run->id);
            $dispatched++;
        }

        $this->info("Dispatched {$dispatched} social listening run(s).");

        return self::SUCCESS;
    }
}
