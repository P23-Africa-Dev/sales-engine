<?php

namespace Tests\Feature\Admin;

use App\Models\Lead;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSmartLeadsTest extends TestCase
{
    public function test_client_user_cannot_access_admin_leads(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $org = Organization::query()->create(['name' => 'Blocked', 'slug' => 'blocked-leads']);

        $this->getJson('/api/v1/admin/organizations/'.$org->id.'/leads')->assertForbidden();
    }

    public function test_admin_can_list_lead_detail_notes_prepare_and_analytics(): void
    {
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);

        $org = Organization::query()->create([
            'name' => 'Smart Co',
            'slug' => 'smart-co',
            'status' => 'active',
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Ada Prospect',
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
            'score' => 82,
            'meta' => ['email' => 'ada@example.com'],
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Low Fit',
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
            'score' => 20,
        ]);

        $this->getJson('/api/v1/admin/organizations/'.$org->id.'/leads?tier=high')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.tier', 'high');

        $this->getJson('/api/v1/admin/leads/'.$lead->id)
            ->assertOk()
            ->assertJsonPath('data.lead.id', $lead->id);

        $this->postJson('/api/v1/admin/leads/'.$lead->id.'/notes', [
            'note' => 'Strong ICP match',
            'reason' => 'Manual review',
        ])->assertCreated();

        $this->postJson('/api/v1/admin/leads/prepare-outreach', [
            'lead_ids' => [$lead->id],
            'sequence' => 'intro-3-touch',
        ])->assertOk()
            ->assertJsonPath('data.prepared_lead_ids.0', $lead->id);

        $this->assertTrue((bool) data_get($lead->fresh()->meta, 'admin_outreach_prepared'));
        $this->assertSame('intro-3-touch', data_get($lead->fresh()->meta, 'admin_outreach_sequence'));

        $this->getJson('/api/v1/admin/organizations/'.$org->id.'/smart-leads/analytics')
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.tier_distribution.high', 1);
    }
}
