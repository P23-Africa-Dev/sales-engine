<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachSendQuota;
use App\Models\User;
use App\Services\Outreach\OutreachQuotaService;
use InvalidArgumentException;
use Tests\TestCase;

class OutreachQuotaServiceTest extends TestCase
{
    public function test_platform_daily_cap_blocks_over_limit(): void
    {
        config(['outreach.quota.platform_daily' => 2]);

        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        OutreachSendQuota::query()->create([
            'organization_id' => $org->id,
            'sender_type' => 'platform',
            'quota_date' => now()->toDateString(),
            'sent_count' => 2,
        ]);

        $this->expectException(InvalidArgumentException::class);
        app(OutreachQuotaService::class)->assertCanSend($org, 'platform');
    }

    public function test_record_send_increments_count(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-' . uniqid()]);
        $service = app(OutreachQuotaService::class);

        $service->recordSend($org, 'platform');
        $service->recordSend($org, 'platform');

        $this->assertSame(2, $service->usedToday($org, 'platform'));
    }
}
