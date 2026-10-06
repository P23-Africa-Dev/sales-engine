<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Lead;
use App\Models\OutreachActivity;
use App\Services\Outreach\OutreachSendService;
use Tests\TestCase;

class OutreachDashboardTest extends TestCase
{
    public function test_paginated_listing_includes_older_records_and_filtered_global_totals(): void
    {
        [, $org] = $this->actingAsOrgMember();
        for ($i = 1; $i <= 25; $i++) {
            OutreachActivity::query()->create(['organization_id' => $org->id, 'name' => 'Email '.$i, 'channel' => 'email', 'delivery_status' => $i <= 10 ? 'delivered' : null]);
        }
        [, $other] = $this->createUserWithOrg();
        OutreachActivity::query()->create(['organization_id' => $other->id, 'name' => 'Private email', 'channel' => 'email']);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/outreach/activities?per_page=10&page=3')->assertOk()->assertJsonCount(5, 'data.items')->assertJsonPath('data.total', 25)->assertJsonPath('data.metrics.total', 25)->assertJsonPath('data.metrics.deliveredCount', 10);
        $this->getJson('/api/v1/outreach/activities?status=delivered')->assertJsonPath('data.total', 10);
        $this->getJson('/api/v1/outreach/activities?per_page=101')->assertUnprocessable();
    }

    public function test_dashboard_uses_real_business_associations_and_unavailable_channel_metrics(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $company = Company::query()->create(['organization_id' => $org->id, 'name' => 'Acme', 'normalized_name' => 'acme', 'sector' => 'Software', 'country_code' => 'NG', 'website' => 'https://acme.example']);
        $lead = Lead::query()->create(['organization_id' => $org->id, 'company_id' => $company->id, 'name' => 'Acme contact', 'stage' => 'new']);
        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$lead->id]])->assertOk();
        OutreachActivity::query()->create(['organization_id' => $org->id, 'company_id' => $company->id, 'lead_id' => $lead->id, 'name' => 'Acme introduction', 'channel' => 'email', 'sent_at' => now(), 'delivery_status' => 'sent']);
        OutreachActivity::query()->create(['organization_id' => $org->id, 'company_id' => $company->id, 'name' => 'Draft', 'channel' => 'email']);

        $this->getJson('/api/v1/outreach/dashboard')->assertOk()->assertJsonPath('data.source', 'live')->assertJsonPath('data.businesses.0.industry', 'Software')->assertJsonPath('data.businesses.0.emailsSent', 1)->assertJsonPath('data.businesses.0.prospects', 1)->assertJsonPath('data.metrics.0.primaryPercent', 50)->assertJsonPath('data.metrics.1.total', null)->assertJsonPath('data.outreach.0.businessId', (string) $company->id);
    }

    public function test_empty_dashboard_never_supplies_sample_businesses(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/outreach/dashboard')->assertOk()->assertJsonPath('data.counts.businesses', 0)->assertJsonPath('data.counts.outreach', 0)->assertJsonPath('data.defaultBusinessId', null)->assertJsonCount(0, 'data.businesses');
    }

    public function test_draft_channels_are_normalized_in_filters_and_counts(): void
    {
        [, $org] = $this->actingAsOrgMember();
        OutreachActivity::query()->create(['organization_id' => $org->id, 'name' => 'Generated email', 'channel' => 'email draft']);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/outreach/activities?channel=email&status=draft')->assertOk()->assertJsonPath('data.items.0.channel', 'email')->assertJsonPath('data.metrics.emailCount', 1);
        $this->getJson('/api/v1/outreach/dashboard')->assertJsonPath('data.metrics.0.total', 1);
    }

    public function test_sent_activity_retry_does_not_enqueue_another_email(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $activity = OutreachActivity::query()->create(['organization_id' => $org->id, 'name' => 'Sent introduction', 'channel' => 'email', 'sent_at' => now(), 'delivery_status' => 'delivered']);
        $this->mock(OutreachSendService::class)->shouldNotReceive('queueEmail');

        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/outreach/activities/'.$activity->id.'/send', ['to_email' => 'ada@example.com', 'subject' => 'Hello', 'body' => 'Reviewed body'])->assertOk()->assertJsonPath('data.sent', true)->assertJsonPath('data.delivery_status', 'delivered');
        $this->assertDatabaseCount('outreach_activities', 1);
    }
}
