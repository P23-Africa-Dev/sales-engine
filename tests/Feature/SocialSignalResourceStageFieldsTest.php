<?php

namespace Tests\Feature;

use App\Http\Resources\SocialSignalResource;
use App\Models\EnrichmentLog;
use App\Models\IcpProfile;
use App\Models\SocialSignal;
use Tests\TestCase;

class SocialSignalResourceStageFieldsTest extends TestCase
{
    public function test_exposes_stage_1_and_stage_2_fields_with_safe_defaults(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        // A signal created before Stage 1-3 columns existed / were populated.
        $legacy = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/legacy',
            'content_hash' => 'legacy-hash',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Legacy signal',
        ]);

        $legacyArray = (new SocialSignalResource($legacy->fresh()))->toArray(request());

        $this->assertFalse($legacyArray['icpFilter']['passed']);
        $this->assertSame([], $legacyArray['icpFilter']['reasons']);
        $this->assertNull($legacyArray['discreteSignalType']);
        $this->assertNull($legacyArray['territory']);
        $this->assertSame([], $legacyArray['namedPeople']);
        $this->assertSame(SocialSignal::ENRICHMENT_NOT_ATTEMPTED, $legacyArray['enrichment']['status']);
        $this->assertNull($legacyArray['enrichment']['attemptedAt']);

        $populated = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/populated',
            'content_hash' => 'populated-hash',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Populated signal',
            'icp_filter_passed' => true,
            'icp_filter_reasons' => ['industry' => true, 'territory' => true],
            'signal_type_key' => 'new_market_entry',
            'territory' => 'Kenya',
            'named_people' => ['Jane Doe'],
            'enrichment_status' => SocialSignal::ENRICHMENT_ATTEMPTED_FOUND,
            'enrichment_attempted_at' => now(),
        ]);

        // resolve() (not toArray()) applies whenLoaded()'s MissingValue filtering —
        // toArray() alone would leave a MissingValue object sitting at the key.
        $populatedArray = (new SocialSignalResource($populated->fresh()))->resolve();

        $this->assertTrue($populatedArray['icpFilter']['passed']);
        $this->assertSame(['industry' => true, 'territory' => true], $populatedArray['icpFilter']['reasons']);
        $this->assertSame('new_market_entry', $populatedArray['discreteSignalType']);
        $this->assertSame('Kenya', $populatedArray['territory']);
        $this->assertSame(['Jane Doe'], $populatedArray['namedPeople']);
        $this->assertSame(SocialSignal::ENRICHMENT_ATTEMPTED_FOUND, $populatedArray['enrichment']['status']);
        $this->assertNotNull($populatedArray['enrichment']['attemptedAt']);

        // Without eager-loading, 'contacts' must be entirely omitted (not an
        // N+1 query per signal) rather than silently empty.
        $this->assertArrayNotHasKey('contacts', $populatedArray['enrichment']);
    }

    public function test_exposes_per_attempt_contacts_when_enrichment_logs_are_eager_loaded(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://example.com/with-contacts',
            'content_hash' => 'with-contacts-hash',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Signal with logged attempts',
        ]);

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
            'provider' => 'role_based_search',
            'found_email' => false,
            'found_phone' => false,
        ]);

        $loaded = SocialSignal::query()->with('enrichmentLogs')->findOrFail($signal->id);
        $array = (new SocialSignalResource($loaded))->toArray(request());

        $this->assertCount(2, $array['enrichment']['contacts']);
        $this->assertSame('Jane Doe', $array['enrichment']['contacts'][0]['personName']);
        $this->assertTrue($array['enrichment']['contacts'][0]['foundEmail']);
        $this->assertSame('apollo', $array['enrichment']['contacts'][0]['provider']);
        $this->assertSame('John Smith', $array['enrichment']['contacts'][1]['personName']);
        $this->assertSame('role_based_search', $array['enrichment']['contacts'][1]['provider']);
    }
}
