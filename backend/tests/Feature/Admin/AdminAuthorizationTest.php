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

class AdminAuthorizationTest extends TestCase
{
    public function test_client_tokens_are_forbidden_on_admin_resource_routes(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $org = Organization::query()->create(['name' => 'Client Org', 'slug' => 'client-org-authz']);
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Lead',
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
        ]);

        $this->getJson('/api/v1/admin/organizations')->assertForbidden();
        $this->getJson('/api/v1/admin/organizations/'.$org->id)->assertForbidden();
        $this->getJson('/api/v1/admin/organizations/'.$org->id.'/leads')->assertForbidden();
        $this->getJson('/api/v1/admin/leads/'.$lead->id)->assertForbidden();
        $this->getJson('/api/v1/admin/outreach/dashboard')->assertForbidden();
        $this->getJson('/api/v1/admin/social-listening/overview')->assertForbidden();
        $this->getJson('/api/v1/admin/crm/overview')->assertForbidden();
        $this->getJson('/api/v1/admin/crm/entries')->assertForbidden();
    }

    public function test_admin_show_routes_return_404_for_missing_resources(): void
    {
        Sanctum::actingAs(PlatformAdmin::factory()->create());

        $this->getJson('/api/v1/admin/organizations/999999')->assertNotFound();
        $this->getJson('/api/v1/admin/leads/999999')->assertNotFound();
        $this->getJson('/api/v1/admin/crm/entries/999999')->assertNotFound();
    }

    public function test_admin_can_read_resources_across_organizations(): void
    {
        Sanctum::actingAs(PlatformAdmin::factory()->create());

        $orgA = Organization::query()->create(['name' => 'Org A', 'slug' => 'org-a-idor']);
        $orgB = Organization::query()->create(['name' => 'Org B', 'slug' => 'org-b-idor']);

        $leadA = Lead::query()->create([
            'organization_id' => $orgA->id,
            'name' => 'A Lead',
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
            'score' => 70,
        ]);
        $leadB = Lead::query()->create([
            'organization_id' => $orgB->id,
            'name' => 'B Lead',
            'stage' => 'new',
            'save_status' => Lead::SAVE_SAVED,
            'score' => 71,
        ]);

        $pipeline = CrmPipeline::query()->create([
            'organization_id' => $orgB->id,
            'name' => 'Default',
            'is_default' => true,
        ]);
        $stage = CrmStage::query()->create([
            'organization_id' => $orgB->id,
            'name' => 'New',
            'slug' => 'new',
            'color' => '#2563EB',
            'sort_order' => 0,
            'is_default' => true,
        ]);
        $entry = CrmEntry::query()->create([
            'organization_id' => $orgB->id,
            'lead_id' => $leadB->id,
            'pipeline_id' => $pipeline->id,
            'stage_id' => $stage->id,
        ]);

        $this->getJson('/api/v1/admin/leads/'.$leadA->id)
            ->assertOk()
            ->assertJsonPath('data.lead.organization_id', $orgA->id);

        $this->getJson('/api/v1/admin/crm/entries/'.$entry->id)
            ->assertOk()
            ->assertJsonPath('data.organization_id', $orgB->id);

        $this->patchJson('/api/v1/admin/crm/entries/'.$entry->id, [
            'reason' => 'Cross-org oversight edit',
            'priority' => 'high',
        ])->assertOk();
    }

    public function test_bulk_mutations_require_admin_auth(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/admin/leads/prepare-outreach', [
            'lead_ids' => [1],
            'sequence' => 'intro',
        ])->assertForbidden();

        $this->postJson('/api/v1/admin/social-listening/signals/review', [
            'ids' => [1],
            'status' => 'reviewed',
            'reason' => 'test',
        ])->assertForbidden();

        $this->postJson('/api/v1/admin/crm/entries/archive', [
            'ids' => [1],
            'reason' => 'test',
        ])->assertForbidden();
    }
}
