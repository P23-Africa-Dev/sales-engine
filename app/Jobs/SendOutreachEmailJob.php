<?php

namespace App\Jobs;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\User;
use App\Services\Outreach\OutreachSendService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendOutreachEmailJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $organizationId,
        public int $userId,
        public string $toEmail,
        public string $subject,
        public string $body,
        public ?int $activityId = null,
    ) {}

    public function handle(OutreachSendService $sendService): void
    {
        $organization = Organization::query()->find($this->organizationId);
        $user = User::query()->find($this->userId);
        $activity = $this->activityId
            ? OutreachActivity::query()->find($this->activityId)
            : null;

        if (! $organization || ! $user) {
            Log::warning('SendOutreachEmailJob missing org or user', [
                'organization_id' => $this->organizationId,
                'user_id' => $this->userId,
            ]);

            return;
        }

        try {
            $sendService->sendEmail(
                $organization,
                $user,
                $this->toEmail,
                $this->subject,
                $this->body,
                $activity,
            );
        } catch (\Throwable $e) {
            Log::warning('SendOutreachEmailJob failed', [
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
