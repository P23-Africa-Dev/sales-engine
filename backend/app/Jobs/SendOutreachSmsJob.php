<?php

namespace App\Jobs;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\User;
use App\Services\Outreach\OutreachSmsSendService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendOutreachSmsJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $organizationId,
        public int $userId,
        public string $toPhone,
        public string $body,
        public ?int $activityId = null,
    ) {}

    public function handle(OutreachSmsSendService $sendService): void
    {
        $organization = Organization::query()->find($this->organizationId);
        $user = User::query()->find($this->userId);
        $activity = $this->activityId
            ? OutreachActivity::query()->find($this->activityId)
            : null;

        if (! $organization || ! $user) {
            Log::warning('SendOutreachSmsJob missing org or user', [
                'organization_id' => $this->organizationId,
                'user_id' => $this->userId,
            ]);

            return;
        }

        try {
            $sendService->sendSms($organization, $user, $this->toPhone, $this->body, $activity);
        } catch (\Throwable $e) {
            Log::warning('SendOutreachSmsJob failed', [
                'organization_id' => $this->organizationId,
                'activity_id' => $this->activityId,
                'error' => $e->getMessage(),
            ]);

            if ($activity) {
                $activity->update([
                    'delivery_status' => 'failed',
                    'bounce_reason' => mb_substr($e->getMessage(), 0, 500),
                ]);
            }

            throw $e;
        }
    }
}
