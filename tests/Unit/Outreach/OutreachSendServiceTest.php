<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachInbox;
use App\Models\OutreachSuppression;
use App\Models\User;
use App\Services\Outreach\OutreachIdentityResolver;
use App\Services\Outreach\OutreachSendService;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class OutreachSendServiceTest extends TestCase
{
    public function test_platform_send_uses_platform_from_and_user_reply_to(): void
    {
        config([
            'services.sendgrid.api_key' => 'sg-test',
            'services.sendgrid.platform_from_email' => 'outreach@thefactory23.com',
        ]);

        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'msg-platform']),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'platform',
            'reply_to_email' => 'replies@ada.dev',
        ]);

        $service = app(OutreachSendService::class);
        $result = $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text');

        $this->assertTrue($result['sent']);
        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['from']['email'] === 'outreach@thefactory23.com'
                && $payload['reply_to']['email'] === 'replies@ada.dev';
        });
    }

    public function test_platform_send_defaults_reply_to_user_email(): void
    {
        config([
            'services.sendgrid.api_key' => 'sg-test',
            'services.sendgrid.platform_from_email' => 'outreach@thefactory23.com',
        ]);

        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'msg-platform-2']),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);

        $service = app(OutreachSendService::class);
        $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text');

        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['from']['email'] === 'outreach@thefactory23.com'
                && $payload['reply_to']['email'] === 'ada@example.com';
        });
    }

    public function test_send_email_requires_confirmed_inbox_and_uses_it_as_from(): void
    {
        config([
            'services.sendgrid.api_key' => 'sg-test',
            'services.sendgrid.platform_from_email' => 'outreach@thefactory23.com',
        ]);

        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'msg-123']),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
            'integrity_checks' => [],
            'warmup_started_at' => now(),
        ]);

        $inbox = OutreachInbox::query()->create([
            'organization_id' => $org->id,
            'email' => 'ada@client.com',
            'display_name' => 'Ada',
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'is_default' => true,
        ]);

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
            'reply_to_email' => 'ada@client.com',
        ]);

        $service = app(OutreachSendService::class);
        $result = $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text', null, $inbox->id);

        $this->assertTrue($result['sent']);
        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['from']['email'] === 'ada@client.com'
                && $payload['reply_to']['email'] === 'ada@client.com';
        });
    }

    public function test_organization_send_blocks_without_confirmed_inbox_when_inbox_requested(): void
    {
        config(['services.sendgrid.api_key' => 'sg-test']);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['email' => 'ada@example.com']);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
        ]);

        $service = app(OutreachSendService::class);

        $this->expectException(InvalidArgumentException::class);
        $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text', null, 999);
    }

    public function test_org_mode_without_setup_falls_back_to_platform(): void
    {
        config([
            'services.sendgrid.api_key' => 'sg-test',
            'services.sendgrid.platform_from_email' => 'outreach@thefactory23.com',
        ]);

        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'msg-fallback']),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['email' => 'ada@example.com']);

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
            'reply_to_email' => 'ada@example.com',
        ]);

        $result = app(OutreachSendService::class)->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text');

        $this->assertTrue($result['sent']);
        Http::assertSent(fn ($request) => $request->data()['from']['email'] === 'outreach@thefactory23.com');
    }

    public function test_send_email_blocks_suppressed_recipient(): void
    {
        config(['services.sendgrid.api_key' => 'sg-test']);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['email' => 'ada@example.com']);

        OutreachSuppression::query()->create([
            'organization_id' => null,
            'email' => 'bounced@example.com',
            'reason' => 'bounce',
            'suppressed_at' => now(),
        ]);

        $service = app(OutreachSendService::class);

        $this->expectException(InvalidArgumentException::class);
        $service->sendEmail($org, $user, 'bounced@example.com', 'Hello', 'Body text');
    }

    public function test_resolve_organization_requires_integrity_when_inbox_forced(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['email' => 'rep@example.com']);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'pending',
        ]);

        $inbox = OutreachInbox::query()->create([
            'organization_id' => $org->id,
            'email' => 'rep@client.com',
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'is_default' => true,
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(OutreachIdentityResolver::class)->resolve($org, $user, $inbox->id);
    }
}
