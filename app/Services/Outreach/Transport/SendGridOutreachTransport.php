<?php

namespace App\Services\Outreach\Transport;

use App\Services\Outreach\OutboundIdentity;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SendGridOutreachTransport implements OutreachTransport
{
    public function send(
        OutboundIdentity $identity,
        string $toEmail,
        string $subject,
        string $body,
        array $customArgs = [],
    ): array {
        $apiKey = trim((string) config('services.sendgrid.api_key'));
        if ($apiKey === '') {
            throw new RuntimeException('SENDGRID_API_KEY is not configured.');
        }

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

        return [
            'message_id' => $response->header('X-Message-Id'),
            'sent' => true,
        ];
    }

    private function toHtml(string $body): string
    {
        return nl2br(e($body), false);
    }
}
