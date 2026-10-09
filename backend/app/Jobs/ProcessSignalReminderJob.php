<?php

namespace App\Jobs;

use App\Models\SignalReminder;
use App\Models\User;
use App\Services\Outreach\OutboundIdentity;
use App\Services\Outreach\Transport\SendGridOutreachTransport;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessSignalReminderJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $reminderId) {}

    public function handle(SendGridOutreachTransport $sendGrid): void
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

        try {
            if (trim((string) config('services.sendgrid.api_key')) !== '') {
                $platformFrom = (string) config('services.sendgrid.platform_from_email', 'outreach@thefactory23.com');
                $identity = new OutboundIdentity(
                    fromEmail: $platformFrom,
                    fromName: 'Sales Engine',
                    replyTo: $platformFrom,
                    senderType: 'platform',
                );

                $sendGrid->send(
                    $identity,
                    $user->email,
                    'Reminder: Social listening opportunity',
                    "Follow up on this signal:\n\n{$signal->post_text}\n\nSuggested message:\n{$signal->suggested_message}",
                    [
                        'organization_id' => (string) ($signal->organization_id ?? ''),
                        'purpose' => 'signal_reminder',
                    ]
                );
            }
        } catch (\Throwable $e) {
            Log::warning('Signal reminder email failed', ['reminder_id' => $this->reminderId, 'error' => $e->getMessage()]);
        }

        $reminder->update(['completed_at' => now()]);
    }
}
