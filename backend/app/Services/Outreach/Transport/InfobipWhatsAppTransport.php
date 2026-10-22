<?php

namespace App\Services\Outreach\Transport;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class InfobipWhatsAppTransport
{
    /**
     * @return array{message_id: ?string, sent: bool}
     */
    public function sendText(string $toE164, string $text): array
    {
        return $this->post('/whatsapp/1/message/text', [
            'from' => $this->sender(),
            'to' => ltrim($toE164, '+'),
            'content' => ['text' => $text],
        ]);
    }

    /**
     * @return array{message_id: ?string, sent: bool}
     */
    public function sendTemplate(string $toE164, string $template, string $body): array
    {
        return $this->post('/whatsapp/1/message/template', [
            'messages' => [[
                'from' => $this->sender(),
                'to' => ltrim($toE164, '+'),
                'content' => [
                    'templateName' => $template,
                    'templateData' => [
                        'body' => ['placeholders' => [$body]],
                    ],
                    'language' => 'en',
                ],
            ]],
        ]);
    }

    public function isConfigured(): bool
    {
        return trim((string) config('services.infobip.api_key')) !== ''
            && trim((string) config('services.infobip.base_url')) !== ''
            && trim((string) config('services.infobip.whatsapp_sender')) !== '';
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{message_id: ?string, sent: bool}
     */
    private function post(string $path, array $payload): array
    {
        $apiKey = trim((string) config('services.infobip.api_key'));
        $baseUrl = rtrim(trim((string) config('services.infobip.base_url')), '/');
        if ($apiKey === '' || $baseUrl === '' || $this->sender() === '') {
            throw new RuntimeException('WhatsApp sending is not configured.');
        }

        $response = Http::timeout(30)
            ->withHeaders(['Authorization' => 'App '.$apiKey])
            ->acceptJson()
            ->post($baseUrl.$path, $payload);

        if (! $response->successful()) {
            throw new RuntimeException('Infobip WhatsApp send failed: '.$response->body());
        }

        $messageId = $response->json('messages.0.messageId') ?? $response->json('messageId');

        return [
            'message_id' => is_string($messageId) ? $messageId : null,
            'sent' => true,
        ];
    }

    private function sender(): string
    {
        return trim((string) config('services.infobip.whatsapp_sender'));
    }
}
