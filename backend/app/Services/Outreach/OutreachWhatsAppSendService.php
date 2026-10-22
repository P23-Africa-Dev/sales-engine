<?php

namespace App\Services\Outreach;

use App\Jobs\SendOutreachWhatsAppJob;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\User;
use App\Services\Outreach\Transport\InfobipWhatsAppTransport;
use InvalidArgumentException;

class OutreachWhatsAppSendService
{
    public function __construct(
        private readonly OutreachQuotaService $quota,
        private readonly InfobipWhatsAppTransport $infobip,
    ) {}

    public function isConfigured(): bool
    {
        return $this->infobip->isConfigured();
    }

    /**
     * @return array{message_id: ?string, sent: bool, queued: bool, delivery_status: string}
     */
    public function queueWhatsApp(
        Organization $organization,
        User $user,
        string $toPhone,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toPhone = PhoneNumber::toE164($toPhone);
        $text = trim($body);
        if ($text === '') {
            throw new InvalidArgumentException('WhatsApp message cannot be empty.');
        }
        if (! $this->infobip->isConfigured()) {
            throw new WhatsAppNotConfiguredException('WhatsApp sending is not configured.');
        }
        $this->quota->assertCanSend($organization, 'whatsapp');

        if ($activity) {
            if (! $activity->user_id) {
                $activity->user_id = $user->id;
            }
            $activity->update([
                'user_id' => $activity->user_id,
                'to_phone' => $toPhone,
                'body' => $text,
                'preview' => mb_substr($text, 0, 160),
                'channel' => 'whatsapp draft',
                'sender_type' => 'whatsapp',
                'delivery_status' => 'queued',
            ]);
        }

        SendOutreachWhatsAppJob::dispatch(
            organizationId: $organization->id,
            userId: $user->id,
            toPhone: $toPhone,
            body: $text,
            activityId: $activity?->id,
        )->afterCommit();

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
    public function sendWhatsApp(
        Organization $organization,
        User $user,
        string $toPhone,
        string $body,
        ?OutreachActivity $activity = null,
    ): array {
        $toPhone = PhoneNumber::toE164($toPhone);
        $text = trim($body);
        if (! $this->infobip->isConfigured()) {
            throw new WhatsAppNotConfiguredException('WhatsApp sending is not configured.');
        }
        $this->quota->assertCanSend($organization, 'whatsapp');

        $sessionOpen = OutreachActivity::query()
            ->where('organization_id', $organization->id)
            ->where('to_phone', $toPhone)
            ->where('channel', 'whatsapp')
            ->where('delivery_status', 'inbound')
            ->where('last_event_at', '>=', now()->subHours(24))
            ->exists();

        $template = trim((string) config('services.infobip.whatsapp_template'));
        if (! $sessionOpen && $template === '') {
            throw new InvalidArgumentException('A WhatsApp template is required for first contact. Set INFOBIP_WHATSAPP_TEMPLATE.');
        }

        $result = $sessionOpen
            ? $this->infobip->sendText($toPhone, $text)
            : $this->infobip->sendTemplate($toPhone, $template, mb_substr($text, 0, 1000));

        $this->quota->recordSend($organization, 'whatsapp');

        if ($activity) {
            $activity->update([
                'user_id' => $activity->user_id ?: $user->id,
                'to_phone' => $toPhone,
                'body' => $text,
                'channel' => 'whatsapp',
                'sent_at' => now(),
                'sender_type' => 'whatsapp',
                'delivery_status' => 'sent',
                'meta' => array_merge($activity->meta ?? [], [
                    'sent' => true,
                    'provider_message_id' => $result['message_id'] ?? null,
                    'whatsapp_mode' => $sessionOpen ? 'session' : 'template',
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
}
