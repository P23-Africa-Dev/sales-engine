<?php

namespace App\Services\Outreach\Transport;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class InfobipSmsTransport
{
    /**
     * @return array{message_id: ?string, sent: bool}
     */
    public function send(string $toE164, string $text, ?string $callbackData = null): array
    {
        $apiKey = trim((string) config('services.infobip.api_key'));
        $baseUrl = rtrim(trim((string) config('services.infobip.base_url')), '/');
        $from = trim((string) config('services.infobip.sms_from'));

        if ($apiKey === '' || $baseUrl === '' || $from === '') {
            throw new RuntimeException('Infobip SMS is not configured. Set INFOBIP_API_KEY, INFOBIP_BASE_URL, and INFOBIP_SMS_FROM.');
        }

        $destination = ['to' => ltrim($toE164, '+')];
        $message = [
            'from' => $from,
            'destinations' => [$destination],
            'text' => $text,
        ];

        $notifyUrl = $this->notifyUrl();
        if ($notifyUrl !== null) {
            $message['notifyUrl'] = $notifyUrl;
            $message['notifyContentType'] = 'application/json';
        }
        if ($callbackData !== null && $callbackData !== '') {
            $message['callbackData'] = $callbackData;
        }

        $response = Http::timeout(30)
            ->withHeaders(['Authorization' => 'App '.$apiKey])
            ->acceptJson()
            ->post($baseUrl.'/sms/2/text/advanced', [
                'messages' => [$message],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Infobip SMS send failed: '.$response->body());
        }

        $messageId = $response->json('messages.0.messageId');

        return [
            'message_id' => is_string($messageId) ? $messageId : null,
            'sent' => true,
        ];
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.infobip.api_key')) !== ''
            && trim((string) config('services.infobip.base_url')) !== ''
            && trim((string) config('services.infobip.sms_from')) !== '';
    }

    private function notifyUrl(): ?string
    {
        $token = trim((string) config('services.infobip.webhook_token'));
        $appUrl = rtrim(trim((string) config('app.url')), '/');
        if ($token === '' || $appUrl === '') {
            return null;
        }

        return $appUrl.'/api/v1/webhooks/infobip/sms?token='.urlencode($token);
    }
}
