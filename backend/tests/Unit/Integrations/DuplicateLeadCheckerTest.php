<?php

namespace Tests\Unit\Integrations;

use App\Models\Lead;
use App\Services\Integrations\Factory23\DuplicateLeadChecker;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DuplicateLeadCheckerTest extends TestCase
{
    public function test_check_duplicate_returns_match_from_crm(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42, 'f23_api_token' => 'token']);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Jane Doe',
            'stage' => 'new',
            'score' => 80,
            'meta' => ['email' => 'jane@example.com', 'company' => 'Acme'],
        ]);

        Http::fake([
            'api.example.com/api/v1/crm/leads/check-duplicate*' => Http::response([
                'data' => [
                    'exists' => true,
                    'match_reason' => 'email',
                    'lead' => ['id' => 77, 'email' => 'jane@example.com', 'name' => 'Jane Doe'],
                ],
            ], 200),
        ]);

        $result = app(DuplicateLeadChecker::class)->checkDuplicate($org, $lead);

        $this->assertTrue($result['exists']);
        $this->assertSame('email', $result['match_reason']);
        $this->assertSame(77, $result['f23_lead']['id']);
    }

    public function test_compare_quality_detects_new_email(): void
    {
        $lead = new Lead([
            'name' => 'Jane Doe',
            'meta' => [
                'email' => 'jane@example.com',
                'phone' => '+15550100',
            ],
        ]);

        $comparison = app(DuplicateLeadChecker::class)->compareQuality($lead, [
            'id' => 77,
            'email' => null,
            'phone' => '+15550100',
        ]);

        $this->assertTrue($comparison['has_new_data']);
        $this->assertContains('email', $comparison['new_fields']);
        $this->assertSame('jane@example.com', $comparison['merge_payload']['email']);
    }
}
