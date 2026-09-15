<?php

namespace Tests\Feature;

use App\Models\EnrichmentLog;
use App\Models\IcpProfile;
use App\Models\SocialSignal;
use Tests\TestCase;

class SocialSignalStageFieldsTest extends TestCase
{
    public function test_new_stage_columns_default_correctly_and_cast_as_expected(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/post/1',
            'content_hash' => 'stage-fields-hash-1',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'A company just opened a Kenyan subsidiary.',
        ]);

        // Existing rows / rows created before Stage 1-3 data is populated must default sanely.
        // Re-fetch from the DB rather than reading the just-inserted instance: columns not
        // passed to create() aren't hydrated onto that instance even though the DB applies
        // its column default — only a fresh read reflects the true default.
        $fresh = SocialSignal::query()->findOrFail($signal->id);
        $this->assertFalse($fresh->icp_filter_passed);
        $this->assertNull($fresh->icp_filter_reasons);
        $this->assertNull($fresh->signal_type_key);
        $this->assertNull($fresh->named_people);
        $this->assertSame(SocialSignal::ENRICHMENT_NOT_ATTEMPTED, $fresh->enrichment_status);
        $this->assertNull($fresh->enrichment_attempted_at);

        $signal->update([
            'icp_filter_passed' => true,
            'icp_filter_reasons' => ['industry' => true, 'territory' => true, 'companySize' => false, 'revenue' => true],
            'signal_type_key' => 'new_market_entry',
            'named_people' => ['Jane Doe', 'John Smith'],
            'territory' => 'Kenya',
        ]);

        $signal->refresh();
        $this->assertTrue($signal->icp_filter_passed);
        $this->assertSame(['industry' => true, 'territory' => true, 'companySize' => false, 'revenue' => true], $signal->icp_filter_reasons);
        $this->assertSame('new_market_entry', $signal->signal_type_key);
        $this->assertSame(['Jane Doe', 'John Smith'], $signal->named_people);
        $this->assertSame('Kenya', $signal->territory);

        EnrichmentLog::query()->create([
            'organization_id' => $org->id,
            'social_signal_id' => $signal->id,
            'person_name' => 'Jane Doe',
            'person_index' => 0,
            'tier' => 'tier3',
            'provider' => 'apollo',
            'found_email' => true,
            'found_phone' => false,
        ]);

        EnrichmentLog::query()->create([
            'organization_id' => $org->id,
            'social_signal_id' => $signal->id,
            'person_name' => 'John Smith',
            'person_index' => 1,
            'tier' => 'tier3',
            'provider' => 'apollo',
            'found_email' => false,
            'found_phone' => false,
        ]);

        $this->assertCount(2, $signal->enrichmentLogs);
        $this->assertTrue($signal->enrichmentLogs->firstWhere('person_name', 'Jane Doe')->found_email);
        $this->assertFalse($signal->enrichmentLogs->firstWhere('person_name', 'John Smith')->found_email);
    }
}
