<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachSendQuota;
use App\Services\Outreach\OutreachQuotaService;
use InvalidArgumentException;
use Tests\TestCase;

class OutreachQuotaServiceTest extends TestCase
{
    public function test_organization_daily_cap_blocks_over_limit(): void
    {
        config([
            'outreach.quota.organization_warmup_start' => 2,
            'outreach.quota.organization_daily_ceiling' => 2,
        ]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'client.com',
            'from_email' => 'sales@client.com',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
            'warmup_started_at' => now(),
        ]);

        OutreachSendQuota::query()->create([
            'organization_id' => $org->id,
            'sender_type' => 'organization',
            'quota_date' => now()->toDateString(),
            'sent_count' => 2,
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(OutreachQuotaService::class)->assertCanSend($org, 'organization');
    }

    public function test_record_send_increments_count(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        $service = app(OutreachQuotaService::class);

        $service->recordSend($org, 'organization');
        $service->recordSend($org, 'organization');

        $this->assertSame(2, $service->usedToday($org, 'organization'));
    }
}
