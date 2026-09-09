<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Services\Outreach\SendGridDomainAuthService;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class SendGridDomainAuthServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.sendgrid.api_key' => 'sg-test']);
    }

    public function test_authenticate_stores_dns_records_as_pending(): void
    {
        Http::fake([
            'api.sendgrid.com/v3/whitelabel/domains' => Http::response([
                'id' => 555,
                'domain' => 'client.com',
                'subdomain' => 'em1234',
                'valid' => false,
                'dns' => [
                    'mail_cname' => ['host' => 'em1234.client.com', 'type' => 'cname', 'data' => 'u1.wl.sendgrid.net', 'valid' => false],
                    'dkim1' => ['host' => 's1._domainkey.client.com', 'type' => 'cname', 'data' => 's1.domainkey.u1.wl.sendgrid.net', 'valid' => false],
                    'dkim2' => ['host' => 's2._domainkey.client.com', 'type' => 'cname', 'data' => 's2.domainkey.u1.wl.sendgrid.net', 'valid' => false],
                ],
            ], 201),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $service = app(SendGridDomainAuthService::class);

        $record = $service->authenticate($org, 'https://Client.com/', 'sales@client.com');

        $this->assertSame('client.com', $record->domain);
        $this->assertSame('pending', $record->verification_status);
        $this->assertCount(3, $record->dns_records);
        $this->assertSame('555', $record->sendgrid_domain_id);
    }

    public function test_authenticate_rejects_from_email_on_a_different_domain(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $service = app(SendGridDomainAuthService::class);

        $this->expectException(InvalidArgumentException::class);
        $service->authenticate($org, 'client.com', 'sales@other.com');
    }

    public function test_verify_marks_record_verified_when_sendgrid_confirms_valid(): void
    {
        Http::fake([
            'api.sendgrid.com/v3/whitelabel/domains/*/validate' => Http::response([
                'valid' => true,
                'validation_results' => [
                    'mail_cname' => ['host' => 'em1234.client.com', 'type' => 'cname', 'data' => 'u1.wl.sendgrid.net', 'valid' => true],
                ],
            ], 200),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'sendgrid_domain_id' => '555',
            'from_email' => 'sales@client.com',
            'verification_status' => 'pending',
        ]);

        $service = app(SendGridDomainAuthService::class);
        $record = $service->verify($org);

        $this->assertSame('verified', $record->verification_status);
        $this->assertTrue($record->valid);
        $this->assertNotNull($record->verified_at);
    }

    public function test_verify_marks_record_failed_when_sendgrid_reports_invalid(): void
    {
        Http::fake([
            'api.sendgrid.com/v3/whitelabel/domains/*/validate' => Http::response(['valid' => false], 200),
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'sendgrid_domain_id' => '555',
            'from_email' => 'sales@client.com',
            'verification_status' => 'pending',
        ]);

        $service = app(SendGridDomainAuthService::class);
        $record = $service->verify($org);

        $this->assertSame('failed', $record->verification_status);
        $this->assertFalse($record->valid);
    }
}
