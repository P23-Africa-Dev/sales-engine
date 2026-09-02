<?php

namespace Tests\Unit\Integrations;

use App\Models\Lead;
use App\Models\Organization;
use App\Services\Integrations\Factory23\CrmSyncService;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

class CrmSyncPayloadTest extends TestCase
{
    public function test_build_lead_payload_maps_top_level_crm_fields(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Elon Musk',
            'stage' => 'new',
            'score' => 90,
            'summary' => '1. Elon Musk · 2. Larry Page',
            'meta' => [
                'title' => 'CEO',
                'company' => 'Tesla',
                'location' => 'Austin, TX',
                'email' => 'elon@tesla.com',
                'phone' => '+1-555-0100',
                'website' => 'https://tesla.com',
                'profile_urls' => ['https://linkedin.com/in/elonmusk'],
                'next_action' => 'Review profile and draft outreach',
                'source_url' => 'https://linkedin.com/in/elonmusk',
            ],
        ]);

        $service = app(CrmSyncService::class);
        $method = new ReflectionMethod(CrmSyncService::class, 'buildLeadPayload');
        $method->setAccessible(true);
        /** @var array<string, mixed> $payload */
        $payload = $method->invoke($service, $org, $lead);

        $this->assertSame('Elon Musk', $payload['name']);
        $this->assertSame('CEO', $payload['position']);
        $this->assertSame('Tesla', $payload['company_name']);
        $this->assertSame('Austin, TX', $payload['location']);
        $this->assertSame('elon@tesla.com', $payload['email']);
        $this->assertSame('+1-555-0100', $payload['phone']);
        $this->assertSame('https://tesla.com', $payload['website']);
        $this->assertSame(['https://linkedin.com/in/elonmusk'], $payload['profile_urls']);
        $this->assertSame('Review profile and draft outreach', $payload['next_action']);
        $this->assertArrayNotHasKey('title', $payload['meta'] ?? []);
        $this->assertArrayNotHasKey('company', $payload['meta'] ?? []);
    }

    public function test_push_lead_sends_top_level_fields_to_factory23(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'token',
            'services.factory23.crm_sync_enabled' => true,
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42, 'factory23_crm_sync_enabled' => true]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Jane Doe',
            'stage' => 'new',
            'score' => 85,
            'meta' => [
                'title' => 'VP Sales',
                'company' => 'Acme Corp',
                'profile_urls' => ['https://linkedin.com/in/janedoe'],
                'next_action' => 'Review and qualify this lead',
            ],
        ]);

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['lead' => ['id' => 900]]], 201),
        ]);

        app(CrmSyncService::class)->pushLead($org, $lead);

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $request->url() === 'https://api.example.com/api/v1/crm/leads'
                && ($body['position'] ?? null) === 'VP Sales'
                && ($body['company_name'] ?? null) === 'Acme Corp'
                && ($body['profile_urls'] ?? []) === ['https://linkedin.com/in/janedoe']
                && ($body['next_action'] ?? null) === 'Review and qualify this lead';
        });
    }
}
