<?php

namespace App\Jobs;

use App\Models\SignalReminder;
use App\Models\User;
use App\Services\Outreach\OutreachIdentityResolver;
use App\Services\Outreach\OutreachSendService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessSignalReminderJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $reminderId) {}

    public function handle(OutreachSendService $sendService, OutreachIdentityResolver $identityResolver): void
    {
        $reminder = SignalReminder::query()
            ->with(['signal', 'signal.organization'])
            ->find($this->reminderId);

        if (! $reminder || $reminder->completed_at || ! $reminder->signal) {
            return;
        }

        $user = User::query()->find($reminder->user_id);
        if (! $user || ! $user->email) {
            $reminder->update(['completed_at' => now()]);

            return;
        }

        $signal = $reminder->signal;
        $org = $signal->organization;

        try {
            if (trim((string) config('services.sendgrid.api_key')) !== '') {
                $sendService->sendEmail(
                    $org,
                    $user,
                    $user->email,
                    'Reminder: Social listening opportunity',
                    "Follow up on this signal:\n\n{$signal->post_text}\n\nSuggested message:\n{$signal->suggested_message}",
                );
            }
        } catch (\Throwable $e) {
            Log::warning('Signal reminder email failed', ['reminder_id' => $this->reminderId, 'error' => $e->getMessage()]);
        }

        $reminder->update(['completed_at' => now()]);
    }
}
