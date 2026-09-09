<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Lead;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeadSyncWithDuplicateTest extends TestCase
{
    public function test_sync_merges_when_crm_duplicate_has_missing_email(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
            'services.factory23.crm_sync_enabled' => true,
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update([
            'f23_company_id' => 42,
            'factory23_crm_sync_enabled' => true,
            'f23_api_token' => 'token',
        ]);

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Harsh Nigam',
            'stage' => 'new',
            'score' => 85,
            'meta' => [
                'email' => 'harsh@example.com',
                'company' => 'Acme',
                'title' => 'Founder',
            ],
        ]);

        Http::fake([
            'api.example.com/api/v1/crm/leads/check-duplicate*' => Http::response([
                'data' => [
                    'exists' => true,
                    'match_reason' => 'name_company',
                    'lead' => [
                        'id' => 501,
                        'name' => 'Harsh Nigam',
                        'email' => null,
                        'company_name' => 'Acme',
                    ],
                ],
            ], 200),
            'api.example.com/api/v1/crm/leads/501/merge' => Http::response([
                'data' => [
                    'updated' => true,
                    'fields_changed' => ['email'],
                    'lead' => ['id' => 501, 'email' => 'harsh@example.com'],
                ],
            ], 200),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/leads/{$lead->id}/sync-to-crm")
            ->assertOk()
            ->assertJsonPath('data.synced', true)
            ->assertJsonPath('data.updated', true)
            ->assertJsonPath('data.crm_duplicate', true)
            ->assertJsonPath('data.fields_updated.0', 'email');

        $lead->refresh();
        $this->assertSame('501', $lead->f23_lead_id);
        $this->assertSame('501', $lead->crm_duplicate_of);
        $this->assertSame(['email'], $lead->crm_fields_updated);
    }

    public function test_sync_skips_create_when_identical_duplicate_exists(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
            'services.factory23.crm_sync_enabled' => true,
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update([
            'f23_company_id' => 42,
            'factory23_crm_sync_enabled' => true,
            'f23_api_token' => 'token',
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Augustina Augustine',
            'stage' => 'new',
            'score' => 85,
            'meta' => [
                'email' => 'augustina@example.com',
                'company' => 'Factory',
            ],
        ]);

        Http::fake([
            'api.example.com/api/v1/crm/leads/check-duplicate*' => Http::response([
                'data' => [
                    'exists' => true,
                    'match_reason' => 'email',
                    'lead' => [
                        'id' => 900,
                        'name' => 'Augustina Augustine',
                        'email' => 'augustina@example.com',
                        'company_name' => 'Factory',
                    ],
                ],
            ], 200),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/leads/{$lead->id}/sync-to-crm")
            ->assertOk()
            ->assertJsonPath('data.synced', true)
            ->assertJsonPath('data.already_synced', true)
            ->assertJsonPath('data.crm_duplicate', true);

        Http::assertNotSent(fn($request) => $request->method() === 'POST'
            && str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/crm/leads'));
    }
}
