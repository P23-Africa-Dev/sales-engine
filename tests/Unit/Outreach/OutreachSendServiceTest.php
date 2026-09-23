<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\OutreachSuppression;
use App\Models\User;
use App\Services\Outreach\OutreachIdentityResolver;
use App\Services\Outreach\OutreachSendService;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class OutreachSendServiceTest extends TestCase
{
    public function test_send_email_uses_platform_sender_by_default(): void
    {
        config([
            'services.sendgrid.api_key' => 'sg-test',
            'services.sendgrid.platform_from_email' => 'outreach@thefactory23.com',
        ]);

        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'msg-123']),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        $user = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);

        $service = app(OutreachSendService::class);
        $result = $service->sendEmail($org, $user, 'prospect@example.com', 'Hello', 'Body text');

        $this->assertTrue($result['sent']);
        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['from']['email'] === 'outreach@thefactory23.com'
                && $payload['reply_to']['email'] === 'ada@example.com'
                && $payload['personalizations'][0]['custom_args']['organization_id'] !== null;
        });
    }

    public function test_send_email_blocks_suppressed_recipient(): void
    {
        config(['services.sendgrid.api_key' => 'sg-test']);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
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

    public function test_resolve_outbound_identity_falls_back_to_platform_when_org_unverified(): void
    {
        config(['services.sendgrid.platform_from_email' => 'outreach@thefactory23.com']);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        $user = User::factory()->create(['email' => 'rep@example.com']);

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
            'reply_to_email' => 'rep@example.com',
        ]);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'pending',
        ]);

        $identity = app(OutreachIdentityResolver::class)->resolve($org, $user);

        $this->assertSame('platform', $identity->senderType);
        $this->assertSame('outreach@thefactory23.com', $identity->fromEmail);
    }

    public function test_resolve_outbound_identity_uses_org_sender_when_verified(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        $user = User::factory()->create(['email' => 'rep@example.com']);

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
            'reply_to_email' => 'rep@example.com',
        ]);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
            'integrity_checks' => [],
        ]);

        $identity = app(OutreachIdentityResolver::class)->resolve($org, $user);

        $this->assertSame('organization', $identity->senderType);
        $this->assertSame('sales@client.com', $identity->fromEmail);
        $this->assertSame('rep@example.com', $identity->replyTo);
    }
}
