<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use RuntimeException;

class OutreachSendService
{
    public function __construct(private readonly OutreachIdentityResolver $identityResolver) {}

    /**
     * @return array{message_id: ?string, sent: bool}
     */
    public function sendEmail(
        Organization $organization,
        User $user,
        string $toEmail,
        string $subject,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            throw new RuntimeException('SENDGRID_API_KEY is not configured.');
        }

        $toEmail = trim($toEmail);
        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $this->assertNotSuppressed($organization, $toEmail);

        $identity = $this->identityResolver->resolve($organization, $user);

        $customArgs = array_filter([
            'organization_id' => (string) $organization->id,
            'activity_id' => $activity?->id ? (string) $activity->id : null,
            'sender_type' => $identity->senderType,
        ], fn ($v) => $v !== null);

        $payload = [
            'personalizations' => [[
                'to' => [['email' => $toEmail]],
                'subject' => $subject,
                'custom_args' => $customArgs,
            ]],
            'from' => [
                'email' => $identity->fromEmail,
                'name' => $identity->fromName,
            ],
            'reply_to' => [
                'email' => $identity->replyTo,
                'name' => $identity->fromName,
            ],
            'content' => [
                [
                    'type' => 'text/plain',
                    'value' => $body,
                ],
                [
                    'type' => 'text/html',
                    'value' => $this->toHtml($body),
                ],
            ],
            'tracking_settings' => [
                'click_tracking' => ['enable' => true],
                'open_tracking' => ['enable' => true],
            ],
        ];

        $unsubscribeGroupId = (int) config('services.sendgrid.unsubscribe_group_id', 0);
        if ($unsubscribeGroupId > 0) {
            $payload['asm'] = ['group_id' => $unsubscribeGroupId];
        }

        $response = Http::timeout(30)
            ->withToken($apiKey)
            ->post('https://api.sendgrid.com/v3/mail/send', $payload);

        if (! $response->successful() && $response->status() !== 202) {
            throw new RuntimeException('SendGrid send failed: '.$response->body());
        }

        $messageId = $response->header('X-Message-Id');

        if ($activity) {
            $activity->update([
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
                'sent_at' => now(),
                'sendgrid_message_id' => $messageId,
                'sender_type' => $identity->senderType,
                'delivery_status' => 'sent',
                'meta' => array_merge($activity->meta ?? [], ['sent' => true]),
            ]);
        }

        return ['message_id' => $messageId, 'sent' => true];
    }

    private function assertNotSuppressed(Organization $organization, string $toEmail): void
    {
        $suppressed = OutreachSuppression::query()
            ->where('email', mb_strtolower($toEmail))
            ->where(function ($query) use ($organization) {
                $query->whereNull('organization_id')->orWhere('organization_id', $organization->id);
            })
            ->exists();

        if ($suppressed) {
            throw new InvalidArgumentException(
                'This address previously bounced, complained, or unsubscribed and can no longer be emailed.'
            );
        }
    }

    private function toHtml(string $body): string
    {
        return nl2br(e($body), false);
    }
}
