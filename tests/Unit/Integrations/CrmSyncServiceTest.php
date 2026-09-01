<?php

namespace Tests\Unit\Integrations;

use App\Models\Lead;
use App\Models\Organization;
use App\Services\Integrations\Factory23\CrmSyncService;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use Tests\TestCase;

class CrmSyncServiceTest extends TestCase
{
    public function test_push_lead_is_idempotent_when_already_synced(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42, 'factory23_crm_sync_enabled' => true]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Synced Co',
            'stage' => 'new',
            'score' => 90,
            'f23_lead_id' => '99',
            'synced_to_f23_at' => now(),
        ]);

        $service = app(CrmSyncService::class);
        $result = $service->pushLead($org, $lead);

        $this->assertTrue($result['synced']);
        $this->assertSame('99', $result['f23_lead_id']);
        $this->assertTrue($result['already_synced']);
        Http::assertNothingSent();
    }

    public function test_push_lead_throws_when_sync_disabled(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Co',
            'stage' => 'new',
            'score' => 70,
        ]);

        $service = app(CrmSyncService::class);

        $this->expectException(InvalidArgumentException::class);
        $service->pushLead($org, $lead);
    }

    public function test_push_lead_posts_to_factory23(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
            'services.factory23.crm_sync_enabled' => true,
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42, 'factory23_crm_sync_enabled' => true]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'New Co',
            'stage' => 'new',
            'score' => 85,
            'summary' => 'Strong fit',
        ]);

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['lead' => ['id' => 501]]], 201),
        ]);

        $service = app(CrmSyncService::class);
        $result = $service->pushLead($org, $lead);

        $this->assertTrue($result['synced']);
        $this->assertSame('501', $result['f23_lead_id']);
        $this->assertSame('501', $lead->fresh()->f23_lead_id);
        $this->assertNotNull($lead->fresh()->synced_to_f23_at);
    }
}
