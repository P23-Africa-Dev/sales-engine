<?php

namespace App\Services\Outreach;

use App\Jobs\SendOutreachSmsJob;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\User;
use App\Services\Outreach\Transport\InfobipSmsTransport;
use InvalidArgumentException;

class OutreachSmsSendService
{
    public function __construct(
        private readonly OutreachQuotaService $quota,
        private readonly InfobipSmsTransport $infobip,
    ) {}

    /**
     * @return array{message_id: ?string, sent: bool, queued: bool, delivery_status: string}
     */
    public function queueSms(
        Organization $organization,
        User $user,
        string $toPhone,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toPhone = PhoneNumber::toE164($toPhone);
        $text = $this->normalizeBody($body);
        $this->assertNotSuppressed($organization, $toPhone);
        $this->assertConfigured();
        $this->quota->assertCanSend($organization, 'sms');

        if ($activity) {
            $activity->update([
                'to_phone' => $toPhone,
                'body' => $text,
                'preview' => mb_substr($text, 0, 160),
                'subject' => null,
                'channel' => 'sms draft',
                'occurred_at' => now(),
                'sender_type' => 'sms',
                'delivery_status' => 'queued',
                'meta' => array_merge($activity->meta ?? [], [
                    'queued' => true,
                    'to_phone' => $toPhone,
                    'sender_type' => 'sms',
                ]),
            ]);
        }

        SendOutreachSmsJob::dispatch(
            organizationId: $organization->id,
            userId: $user->id,
            toPhone: $toPhone,
            body: $text,
            activityId: $activity?->id,
        );

        return [
            'message_id' => null,
            'sent' => false,
            'queued' => true,
            'delivery_status' => 'queued',
        ];
    }

    /**
     * @return array{message_id: ?string, sent: bool, queued: bool, delivery_status: string}
     */
    public function sendSms(
        Organization $organization,
        User $user,
        string $toPhone,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toPhone = PhoneNumber::toE164($toPhone);
        $text = $this->normalizeBody($body);
        $this->assertNotSuppressed($organization, $toPhone);
        $this->assertConfigured();
        $this->quota->assertCanSend($organization, 'sms');

        $callback = $activity ? 'activity:'.$activity->id : null;
        $result = $this->infobip->send($toPhone, $text, $callback);
        $this->quota->recordSend($organization, 'sms');

        if ($activity) {
            $activity->update([
                'to_phone' => $toPhone,
                'body' => $text,
                'preview' => mb_substr($text, 0, 160),
                'subject' => null,
                'channel' => 'sms',
                'occurred_at' => now(),
                'sent_at' => now(),
                'sender_type' => 'sms',
                'delivery_status' => 'sent',
                'bounce_reason' => null,
                'meta' => array_merge($activity->meta ?? [], [
                    'sent' => true,
                    'to_phone' => $toPhone,
                    'sender_type' => 'sms',
                    'provider_message_id' => $result['message_id'] ?? null,
                ]),
            ]);
        }

        return [
            'message_id' => $result['message_id'] ?? null,
            'sent' => true,
            'queued' => false,
            'delivery_status' => 'sent',
        ];
    }

    private function assertConfigured(): void
    {
        if (! $this->infobip->isConfigured()) {
            throw new InvalidArgumentException('SMS sending is not configured yet. Add the Infobip sender in platform settings.');
        }
    }

    private function normalizeBody(string $body): string
    {
        $text = trim($body);
        if ($text === '') {
            throw new InvalidArgumentException('SMS message cannot be empty.');
        }

        if (mb_strlen($text) > 480) {
            throw new InvalidArgumentException('SMS message must be 480 characters or fewer.');
        }

        return $text;
    }

    private function assertNotSuppressed(Organization $organization, string $toPhone): void
    {
        $digits = ltrim($toPhone, '+');
        $suppressed = OutreachSuppression::query()
            ->where(function ($query) use ($toPhone, $digits) {
                $query->where('phone', $toPhone)->orWhere('phone', $digits);
            })
            ->where(function ($query) use ($organization) {
                $query->whereNull('organization_id')->orWhere('organization_id', $organization->id);
            })
            ->exists();

        if ($suppressed) {
            throw new InvalidArgumentException('This phone number is suppressed and cannot be texted.');
        }
    }
}
