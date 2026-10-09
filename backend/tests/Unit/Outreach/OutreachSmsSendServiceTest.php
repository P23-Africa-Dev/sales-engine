<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\User;
use App\Services\Outreach\OutreachSmsSendService;
use App\Services\Outreach\PhoneNumber;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class OutreachSmsSendServiceTest extends TestCase
{
    public function test_phone_normalizes_local_nigeria_and_e164(): void
    {
        $this->assertSame('+2348012345678', PhoneNumber::toE164('08012345678'));
        $this->assertSame('+14155552671', PhoneNumber::toE164('+1 415 555 2671'));
    }

    public function test_send_sms_posts_to_infobip_and_records_quota(): void
    {
        config([
            'services.infobip.api_key' => 'ib-test',
            'services.infobip.base_url' => 'https://example.api.infobip.com',
            'services.infobip.sms_from' => 'Factory',
            'services.infobip.webhook_token' => 'tok',
            'app.url' => 'https://api.salesengine.thefactory23.com',
            'outreach.quota.sms_daily' => 20,
        ]);

        Http::fake([
            'example.api.infobip.com/*' => Http::response([
                'messages' => [['messageId' => 'ib-msg-1']],
            ], 200),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create();
        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Ada',
            'channel' => 'email draft',
            'preview' => 'Hi',
            'body' => 'Hi Ada, quick note.',
            'occurred_at' => now(),
        ]);

        $result = app(OutreachSmsSendService::class)->sendSms(
            $org,
            $user,
            '08012345678',
            'Hi Ada, quick note.',
            $activity,
        );

        $this->assertTrue($result['sent']);
        $this->assertSame('ib-msg-1', $result['message_id']);
        Http::assertSent(function ($request) {
            $payload = $request->data();
            $message = $payload['messages'][0];

            return $request->hasHeader('Authorization', 'App ib-test')
                && $message['from'] === 'Factory'
                && $message['destinations'][0]['to'] === '2348012345678'
                && str_contains($message['notifyUrl'], 'token=tok');
        });

        $activity->refresh();
        $this->assertSame('+2348012345678', $activity->to_phone);
        $this->assertSame('sent', $activity->delivery_status);
    }

    public function test_send_sms_blocks_suppressed_number(): void
    {
        config([
            'services.infobip.api_key' => 'ib-test',
            'services.infobip.base_url' => 'https://example.api.infobip.com',
            'services.infobip.sms_from' => 'Factory',
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create();

        OutreachSuppression::query()->create([
            'organization_id' => $org->id,
            'email' => 'sms:+2348012345678',
            'phone' => '+2348012345678',
            'reason' => 'unsubscribe',
            'suppressed_at' => now(),
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(OutreachSmsSendService::class)->sendSms($org, $user, '+2348012345678', 'Hello');
    }
}
