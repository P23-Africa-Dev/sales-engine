<?php

namespace Tests\Feature;

use App\Http\Resources\LeadResource;
use App\Models\IcpProfile;
use App\Models\Lead;
use Tests\TestCase;

class LeadResourceContactStatusTest extends TestCase
{
    public function test_contact_status_is_null_for_a_lead_created_before_this_field_existed(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Legacy Lead',
            'source' => 'serper',
            'score' => 70,
            'summary' => 'A lead from before contact_status existed.',
            'stage' => 'new',
            'meta' => ['contact_ready' => true],
        ]);

        $array = (new LeadResource($lead))->toArray(request());

        $this->assertNull($array['contact_status']);
        $this->assertTrue($array['contact_ready']); // unaffected, backward compatible
    }

    public function test_contact_status_reflects_each_of_the_three_states(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        foreach (['not_attempted', 'found', 'not_found'] as $status) {
            $lead = Lead::query()->create([
                'organization_id' => $org->id,
                'icp_profile_id' => $icp->id,
                'name' => "Lead {$status}",
                'source' => 'serper',
                'score' => 70,
                'summary' => 'x',
                'stage' => 'new',
                'meta' => ['contact_status' => $status],
            ]);

            $array = (new LeadResource($lead))->toArray(request());

            $this->assertSame($status, $array['contact_status']);
        }
    }

    public function test_an_unrecognized_stored_value_falls_back_to_null_rather_than_passing_through(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Lead',
            'source' => 'serper',
            'score' => 70,
            'summary' => 'x',
            'stage' => 'new',
            'meta' => ['contact_status' => 'garbage-value'],
        ]);

        $array = (new LeadResource($lead))->toArray(request());

        $this->assertNull($array['contact_status']);
    }
}
