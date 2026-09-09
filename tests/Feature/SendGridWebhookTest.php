<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\OutreachWebhookEvent;
use Tests\TestCase;

class SendGridWebhookTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // No public key configured -> signature verification is skipped in tests,
        // exercising the same processing path a verified request would take.
        config(['services.sendgrid.webhook_public_key' => null]);
    }

    public function test_delivered_event_updates_the_matching_activity(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Prospect',
            'channel' => 'email draft',
            'occurred_at' => now(),
        ]);

        $this->postJson('/api/v1/webhooks/sendgrid', [
            [
                'sg_event_id' => 'evt-1',
                'sg_message_id' => 'msg-1',
                'event' => 'delivered',
                'email' => 'prospect@example.com',
                'timestamp' => now()->timestamp,
                'organization_id' => (string) $org->id,
                'activity_id' => (string) $activity->id,
            ],
        ])->assertOk();

        $activity->refresh();
        $this->assertSame('delivered', $activity->delivery_status);
        $this->assertNotNull($activity->last_event_at);
        $this->assertDatabaseCount('outreach_webhook_events', 1);
    }

    public function test_bounce_event_suppresses_the_recipient(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);

        $this->postJson('/api/v1/webhooks/sendgrid', [
            [
                'sg_event_id' => 'evt-2',
                'event' => 'bounce',
                'email' => 'Bad@Example.com',
                'reason' => '550 mailbox does not exist',
                'timestamp' => now()->timestamp,
                'organization_id' => (string) $org->id,
            ],
        ])->assertOk();

        $this->assertDatabaseHas('outreach_suppressions', [
            'email' => 'bad@example.com',
            'reason' => 'bounce',
        ]);
    }

    public function test_duplicate_event_id_is_processed_only_once(): void
    {
        $payload = [
            [
                'sg_event_id' => 'evt-dup',
                'event' => 'open',
                'email' => 'a@example.com',
                'timestamp' => now()->timestamp,
            ],
        ];

        $this->postJson('/api/v1/webhooks/sendgrid', $payload)->assertOk();
        $this->postJson('/api/v1/webhooks/sendgrid', $payload)->assertOk();

        $this->assertSame(1, OutreachWebhookEvent::query()->where('sg_event_id', 'evt-dup')->count());
    }

    public function test_rejects_invalid_signature_when_public_key_configured(): void
    {
        config(['services.sendgrid.webhook_public_key' => base64_encode('not-a-real-key-but-64-bytes-of-junk-data-1234567890abcdef')]);

        $this->postJson('/api/v1/webhooks/sendgrid', [
            ['sg_event_id' => 'evt-3', 'event' => 'open', 'email' => 'a@example.com'],
        ], ['X-Twilio-Email-Event-Webhook-Signature' => 'bogus', 'X-Twilio-Email-Event-Webhook-Timestamp' => '123'])
            ->assertStatus(403);
    }
}
