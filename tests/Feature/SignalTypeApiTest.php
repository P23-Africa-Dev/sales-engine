<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use Database\Seeders\SignalTypeDefinitionSeeder;
use Tests\TestCase;

class SignalTypeApiTest extends TestCase
{
    public function test_lists_default_pack_types(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);
        [, $org] = $this->actingAsOrgMember();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/signal-types');

        $response->assertOk();
        $keys = collect($response->json('data'))->pluck('key')->all();
        $this->assertContains('new_market_entry', $keys);
        $this->assertContains('leadership_hire_in_territory', $keys);
    }

    public function test_scopes_types_to_the_icp_pack(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Software ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'signalTypePacks' => ['software_dev_vertical'],
            ]),
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/signal-types?icpProfileId='.$icp->id);

        $response->assertOk();
        $keys = collect($response->json('data'))->pluck('key')->all();
        $this->assertContains('engineering_team_disruption', $keys);
        $this->assertNotContains('new_market_entry', $keys);
    }
}
