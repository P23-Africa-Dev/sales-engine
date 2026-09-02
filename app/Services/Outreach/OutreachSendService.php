<?php

namespace App\Services\Outreach;

use App\Models\Organization;
use App\Models\OutreachActivity;
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

        if (! filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('A valid recipient email is required to send outreach.');
        }

        $identity = $this->identityResolver->resolve($organization, $user);

        $response = Http::timeout(30)
            ->withToken($apiKey)
            ->post('https://api.sendgrid.com/v3/mail/send', [
                'personalizations' => [[
                    'to' => [['email' => $toEmail]],
                    'subject' => $subject,
                ]],
                'from' => [
                    'email' => $identity->fromEmail,
                    'name' => $identity->fromName,
                ],
                'reply_to' => [
                    'email' => $identity->replyTo,
                    'name' => $identity->fromName,
                ],
                'content' => [[
                    'type' => 'text/plain',
                    'value' => $body,
                ]],
            ]);

        if (! $response->successful() && $response->status() !== 202) {
            throw new RuntimeException('SendGrid send failed: '.$response->body());
        }

        $messageId = $response->header('X-Message-Id');

        if ($activity) {
            $activity->update([
                'sent_at' => now(),
                'sendgrid_message_id' => $messageId,
                'sender_type' => $identity->senderType,
                'meta' => array_merge($activity->meta ?? [], ['sent' => true]),
            ]);
        }

        return ['message_id' => $messageId, 'sent' => true];
    }
}
