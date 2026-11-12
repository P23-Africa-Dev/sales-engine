<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialSignal;
use Tests\TestCase;

/**
 * The overview's output table: Company · Signal · Territory · ICP status · Contact · Contact status.
 */
class OpportunityApiTest extends TestCase
{
    /**
     * @param  array<string, mixed>  $meta
     * @param  array<string, mixed>  $attributes
     */
    private function signal(Organization $org, IcpProfile $icp, array $meta, array $attributes = []): SocialSignal
    {
        return SocialSignal::query()->create(array_merge([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'content_hash' => 'hash-'.uniqid('', true),
            'post_url' => 'https://news.example/'.uniqid(),
            'platform' => 'news',
            'source_label' => 'News · Example',
            'post_text' => 'ABC Manufacturing opens a distribution operation in Kenya.',
            'summary' => 'Announced a new distribution operation in Kenya.',
            'company_name' => 'ABC Manufacturing',
            'territory' => 'Kenya',
            'signal_type_key' => 'new_market_entry',
            'intent_label' => 'New Market Entry',
            'score' => 85,
            'status' => 'new',
            'posted_at' => '2026-10-12',
            'meta' => $meta + ['opportunity' => true],
        ], $attributes));
    }

    /**
     * @return array{0: Organization, 1: IcpProfile}
     */
    private function account(): array
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create(['organization_id' => $org->id, 'name' => 'ICP', 'is_active' => true, 'config' => IcpProfile::defaultConfig()]);

        return [$org, $icp];
    }

    public function test_lists_verified_icp_fitting_company_events_with_contact_status(): void
    {
        [$org, $icp] = $this->account();
        $this->signal($org, $icp, [
            'icp_status' => 'qualified',
            'icp_dimensions' => ['industry' => 'verified', 'territory' => 'verified'],
            'firmographics' => ['industry' => 'Machinery Manufacturing', 'employee_range' => '201-500', 'headquarters' => 'Stuttgart'],
            'contact' => ['name' => 'John Smith', 'role' => 'Export Director', 'email' => 'john.smith@abc.example', 'email_status' => 'verified', 'linkedin_url' => 'https://linkedin.com/in/john-smith'],
            'contact_status' => 'enriched',
        ]);
        $this->signal($org, $icp, ['icp_status' => 'partial', 'contact_status' => 'no_contact_found'], ['company_name' => 'TechWorks GmbH', 'territory' => 'Ghana', 'posted_at' => '2026-10-01']);
        // Not opportunities: a not-qualified company, a buyer-intent post, a dismissed event.
        $this->signal($org, $icp, ['icp_status' => 'not_qualified'], ['company_name' => 'Too Big Corp']);
        $this->signal($org, $icp, ['icp_status' => 'qualified'], ['company_name' => 'Asker Ltd', 'signal_type_key' => null]);
        $this->signal($org, $icp, ['icp_status' => 'qualified'], ['company_name' => 'Gone Ltd', 'status' => 'dismissed']);
        // A social post whose company/territory could not be confirmed.
        $this->signal($org, $icp, ['icp_status' => 'partial', 'opportunity' => false], ['company_name' => 'Nigianto', 'platform' => 'linkedin']);
        // Another account's opportunity.
        $other = Organization::query()->create(['name' => 'Other', 'slug' => 'other-'.uniqid()]);
        $otherIcp = IcpProfile::query()->create(['organization_id' => $other->id, 'name' => 'ICP', 'is_active' => true, 'config' => IcpProfile::defaultConfig()]);
        $this->signal($other, $otherIcp, ['icp_status' => 'qualified'], ['company_name' => 'Elsewhere Ltd']);

        $response = $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/opportunities')->assertOk();

        $this->assertSame(['ABC Manufacturing', 'TechWorks GmbH'], array_column($response->json('data'), 'company'));
        $response->assertJsonPath('data.0.signal', 'New Market Entry')
            ->assertJsonPath('data.0.territory', 'Kenya')
            ->assertJsonPath('data.0.icpStatus', 'qualified')
            ->assertJsonPath('data.0.companyProfile.size', '201-500')
            ->assertJsonPath('data.0.contact.name', 'John Smith')
            ->assertJsonPath('data.0.contact.emailStatus', 'verified')
            ->assertJsonPath('data.0.contactStatus', 'enriched')
            ->assertJsonPath('data.0.signalDate', '2026-10-12')
            ->assertJsonPath('data.1.contactStatus', 'no_contact_found')
            ->assertJsonPath('meta.total', 2);
    }

    public function test_filters_by_icp_and_contact_status(): void
    {
        [$org, $icp] = $this->account();
        $this->signal($org, $icp, ['icp_status' => 'qualified', 'contact_status' => 'enriched'], ['company_name' => 'A Ltd']);
        $this->signal($org, $icp, ['icp_status' => 'partial'], ['company_name' => 'B Ltd']);
        $headers = $this->orgHeaders($org);

        $this->assertSame(['A Ltd'], array_column($this->withHeaders($headers)->getJson('/api/v1/opportunities?icp_status=qualified')->json('data'), 'company'));
        $this->assertSame(['B Ltd'], array_column($this->withHeaders($headers)->getJson('/api/v1/opportunities?contact_status=searching')->json('data'), 'company'));
        $this->withHeaders($headers)->getJson('/api/v1/opportunities?icp_status=not_qualified')->assertUnprocessable();
    }

    public function test_exports_the_overview_columns_as_csv(): void
    {
        [$org, $icp] = $this->account();
        $this->signal($org, $icp, [
            'icp_status' => 'qualified',
            'contact' => ['name' => '=HYPERLINK("x")', 'role' => 'Export Director'],
            'contact_status' => 'enriched',
        ]);

        $csv = $this->withHeaders($this->orgHeaders($org))->get('/api/v1/opportunities/export')->assertOk()->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));

        $this->assertStringStartsWith('Company,Signal,Detail,Territory,"Signal date","Source URL","ICP status"', $lines[0]);
        $this->assertStringContainsString('ABC Manufacturing', $lines[1]);
        $this->assertStringContainsString('qualified', $lines[1]);
        // Spreadsheet formulas are neutralised.
        $this->assertStringContainsString("'=HYPERLINK", $lines[1]);
    }
}
