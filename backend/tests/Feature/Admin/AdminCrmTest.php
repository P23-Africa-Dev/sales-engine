<?php

namespace Tests\Feature\Admin;

use App\Models\CrmEntry;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminCrmTest extends TestCase
{
    public function test_client_user_forbidden(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/crm/overview')->assertForbidden();
    }

    public function test_admin_crm_overview_archive_and_policy(): void
    {
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);
        $org = Organization::query()->create([
            'name' => 'CRM Org',
            'slug' => 'crm-org',
            'status' => 'active',
            'crm_stale_days' => 7,
        ]);
        $pipeline = CrmPipeline::query()->create([
            'organization_id' => $org->id,
            'name' => 'Default',
            'is_default' => true,
        ]);
        $stage = CrmStage::query()->create([
            'organization_id' => $org->id,
            'name' => 'New Lead',
            'slug' => 'new',
            'color' => '#2563EB',
            'is_default' => true,
        ]);
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Deal Co',
            'source' => 'manual',
            'score' => 70,
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
        ]);
        $entry = CrmEntry::query()->create([
            'organization_id' => $org->id,
            'lead_id' => $lead->id,
            'pipeline_id' => $pipeline->id,
            'stage_id' => $stage->id,
            'budget_amount' => 12000,
            'budget_currency' => 'EUR',
        ]);

        $this->getJson('/api/v1/admin/crm/overview')->assertOk();
        $this->getJson('/api/v1/admin/crm/entries')->assertOk()->assertJsonPath('meta.total', 1);

        $this->postJson('/api/v1/admin/crm/entries/archive', [
            'ids' => [$entry->id],
            'reason' => 'Stale demo cleanup',
        ])->assertOk();

        $this->assertNotNull($entry->fresh()->archived_at);

        $this->putJson('/api/v1/admin/organizations/'.$org->id.'/crm/review-policy', [
            'crm_stale_days' => 14,
            'reason' => 'Longer sales cycle.',
        ])->assertOk();

        $this->assertSame(14, (int) $org->fresh()->crm_stale_days);
    }
}
