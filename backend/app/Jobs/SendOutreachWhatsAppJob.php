<?php

namespace App\Jobs;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\User;
use App\Services\Outreach\OutreachWhatsAppSendService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendOutreachWhatsAppJob implements ShouldQueue
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

    public function handle(OutreachWhatsAppSendService $sendService): void
    {
        $organization = Organization::query()->find($this->organizationId);
        $user = User::query()->find($this->userId);
        $activity = $this->activityId ? OutreachActivity::query()->find($this->activityId) : null;

        if (! $organization || ! $user) {
            Log::warning('SendOutreachWhatsAppJob missing org or user', [
                'organization_id' => $this->organizationId,
            ]);

            return;
        }

        $sendService->sendWhatsApp($organization, $user, $this->toPhone, $this->body, $activity);
    }
}
