<?php

namespace Tests\Feature;

use App\Models\OutreachActivity;
use Tests\TestCase;

class InfobipSmsWebhookTest extends TestCase
{
    public function test_delivery_report_updates_activity(): void
    {
        config(['services.infobip.webhook_token' => 'tok']);

        [$user, $org] = $this->actingAsOrgMember();

        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Ada',
            'channel' => 'sms',
            'preview' => 'Hi',
            'body' => 'Hi',
            'to_phone' => '+2348012345678',
            'sender_type' => 'sms',
            'delivery_status' => 'sent',
            'occurred_at' => now(),
            'meta' => ['provider_message_id' => 'ib-msg-1'],
        ]);

        $this->postJson('/api/v1/webhooks/infobip/sms?token=tok', [
            'results' => [[
                'messageId' => 'ib-msg-1',
                'callbackData' => 'activity:'.$activity->id,
                'to' => '2348012345678',
                'status' => [
                    'groupName' => 'DELIVERED',
                    'name' => 'DELIVERED_TO_HANDSET',
                    'description' => 'Delivered',
                ],
                'error' => ['name' => 'NO_ERROR', 'description' => 'No Error'],
            ]],
        ])->assertOk();

        $activity->refresh();
        $this->assertSame('delivered', $activity->delivery_status);
    }

    public function test_rejects_missing_token(): void
    {
        config(['services.infobip.webhook_token' => 'tok']);

        $this->postJson('/api/v1/webhooks/infobip/sms', [
            'results' => [],
        ])->assertStatus(401);
    }
}
