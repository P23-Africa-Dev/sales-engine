<?php

namespace Tests\Feature;

use App\Models\Lead;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class RevalidateLeadsCommandTest extends TestCase
{
    public function test_dry_run_reports_invalid_draft_leads_without_deleting(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $junk = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => '11 Tips to Generate Sales Leads',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'score' => 70,
        ]);

        $good = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Acme Distributors Lagos',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'score' => 80,
            'meta' => ['website' => 'https://acme.example.com'],
        ]);

        $exit = Artisan::call('leads:revalidate', [
            '--organization' => $org->id,
        ]);

        $this->assertSame(0, $exit);
        $this->assertDatabaseHas('leads', ['id' => $junk->id]);
        $this->assertDatabaseHas('leads', ['id' => $good->id]);
        $this->assertStringContainsString('invalid=1', Artisan::output());
    }

    public function test_apply_deletes_invalid_draft_leads(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $junk = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Matching Requirement',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'score' => 55,
        ]);

        Artisan::call('leads:revalidate', [
            '--organization' => $org->id,
            '--apply' => true,
        ]);

        $this->assertDatabaseMissing('leads', ['id' => $junk->id]);
    }
}
