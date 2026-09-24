<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
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

        $service = app(OutreachSendService::class);
        $result = $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text', null, $inbox->id);

        $this->assertTrue($result['sent']);
        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['from']['email'] === 'ada@client.com'
                && $payload['reply_to']['email'] === 'ada@client.com';
        });
    }

    public function test_send_email_blocks_without_confirmed_inbox(): void
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
        $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text');
    }

    public function test_send_email_blocks_suppressed_recipient(): void
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

        OutreachInbox::query()->create([
            'organization_id' => $org->id,
            'email' => 'ada@client.com',
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'is_default' => true,
        ]);

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

    public function test_resolve_requires_integrity_and_inbox(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create(['email' => 'rep@example.com']);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'pending',
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(OutreachIdentityResolver::class)->resolve($org, $user);
    }
}
