<?php

namespace Tests\Feature\Admin;

use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\SocialListeningRun;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminEngineHealthTest extends TestCase
{
    public function test_client_user_cannot_see_engine_health(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/admin/engine-health')->assertForbidden();
    }

    public function test_admin_sees_lead_search_contact_and_listening_health(): void
    {
        Sanctum::actingAs(PlatformAdmin::factory()->create());

        $org = Organization::query()->create(['name' => 'Health Co', 'slug' => 'health-co', 'status' => 'active']);
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        foreach ([[60, 10, 10], [120, 6, 10]] as [$seconds, $found, $requested]) {
            DiscoveryRun::query()->create([
                'organization_id' => $org->id,
                'icp_profile_id' => $icp->id,
                'status' => 'completed',
                'query' => 'fintech',
                'intent' => 'generate_leads',
                'result_summary' => [
                    'elapsed_seconds' => $seconds,
                    'lead_count' => $found,
                    'requested_lead_count' => $requested,
                    'timings' => ['scoring' => $seconds / 2],
                    'provider_failures' => ['serper' => ['failures' => 1, 'reason' => 'timeout']],
                ],
            ]);
        }
        DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'status' => 'failed',
            'query' => 'fintech',
            'intent' => 'generate_leads',
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Acme',
            'meta' => [
                'contact_status' => 'found',
                'company_email' => 'hello@acme.com',
                'contact_sources' => ['company_email' => ['value' => 'hello@acme.com', 'confidence' => 'on_page']],
            ],
        ]);
        Lead::query()->create(['organization_id' => $org->id, 'name' => 'Beta', 'meta' => ['contact_status' => 'not_found']]);

        SocialListeningRun::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'status' => 'completed',
            'signals_created' => 3,
            'result_summary' => [
                'totalChecked' => 40,
                'qualified' => 2,
                'possible' => 1,
                'rejected' => ['total' => 37, 'gate' => 30, 'stale' => 7],
                'sources' => [['key' => 'x', 'status' => 'failed']],
            ],
        ]);

        $this->getJson('/api/v1/admin/engine-health?days=7')
            ->assertOk()
            ->assertJsonPath('data.lead_search.runs', 3)
            ->assertJsonPath('data.lead_search.failed', 1)
            ->assertJsonPath('data.lead_search.avg_seconds', 90)
            ->assertJsonPath('data.lead_search.requested_count_met_pct', 50)
            ->assertJsonPath('data.lead_search.avg_stage_seconds.scoring', 45)
            ->assertJsonPath('data.lead_search.provider_failures', ['serper:timeout' => 2])
            ->assertJsonPath('data.contacts.with_email_pct', 50)
            ->assertJsonPath('data.contacts.sources', ['company_email:on_page' => 1])
            ->assertJsonPath('data.social_listening.posts_checked', 40)
            ->assertJsonPath('data.social_listening.strong_openings', 2)
            ->assertJsonPath('data.social_listening.possible_openings', 1)
            ->assertJsonPath('data.social_listening.dropped', ['gate' => 30, 'stale' => 7])
            ->assertJsonPath('data.social_listening.latest_source_status', ['x' => 'failed']);
    }
}
