<?php

namespace Tests\Unit\Jobs;

use App\Jobs\ResolveLeadLocationJob;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\IcpFiltering\IcpFilterService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ResolveLeadLocationJobTest extends TestCase
{
    public function test_fills_unknown_location_from_tld_then_skips_serper(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'territories' => ['Nigeria'],
            ]),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Kobo Logistics',
            'source' => 'serper',
            'score' => 70,
            'meta' => [
                'website' => 'kobo360.com.ng',
                'location_status' => 'unknown',
            ],
        ]);

        Http::fake();

        (new ResolveLeadLocationJob($lead->id))->handle(new DiscoveryGeo, new IcpFilterService);

        $lead->refresh();
        $this->assertSame('Nigeria', $lead->meta['location'] ?? null);
        $this->assertSame('resolved', $lead->meta['location_status'] ?? null);
        Http::assertNothingSent();
    }

    public function test_marks_outside_territory_when_serper_proves_india(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
        ]);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'NG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'territories' => ['Nigeria'],
            ]),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Pune Freight Hub',
            'source' => 'serper',
            'score' => 70,
            'meta' => [
                'location_status' => 'unknown',
            ],
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [
                    [
                        'title' => 'Pune Freight Hub headquarters',
                        'link' => 'https://punefreight.example.com',
                        'snippet' => 'Headquarters in Pune, India.',
                    ],
                ],
            ], 200),
        ]);

        (new ResolveLeadLocationJob($lead->id))->handle(new DiscoveryGeo, new IcpFilterService);

        $lead->refresh();
        $this->assertStringContainsString('India', (string) ($lead->meta['location'] ?? ''));
        $this->assertSame('outside_territory', $lead->meta['location_status'] ?? null);
        $this->assertFalse((bool) ($lead->meta['icp_recommended'] ?? true));
    }
}
