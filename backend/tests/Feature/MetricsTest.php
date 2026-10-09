<?php

namespace Tests\Feature;

use App\Models\Lead;
use Tests\TestCase;

class MetricsTest extends TestCase
{
    public function test_metrics_split_draft_and_saved_leads(): void
    {
        [, $org] = $this->actingAsOrgMember();

        Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Draft Lead',
            'stage' => 'new',
            'save_status' => 'draft',
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Saved Lead',
            'stage' => 'new',
            'save_status' => 'saved',
            'synced_to_f23_at' => now(),
            'f23_lead_id' => '99',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/metrics')
            ->assertOk()
            ->assertJsonPath('data.leads_discovered', 1)
            ->assertJsonPath('data.leads_pending_review', 1)
            ->assertJsonPath('data.leads_in_crm', 1);
    }
}
