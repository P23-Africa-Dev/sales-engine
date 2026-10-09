<?php

namespace Tests\Feature;

use App\Models\SignalTypeDefinition;
use App\Services\SignalDetection\SignalTypeRegistry;
use Database\Seeders\SignalTypeDefinitionSeeder;
use Tests\TestCase;

class SignalTypeRegistryTest extends TestCase
{
    public function test_seeder_populates_the_four_core_spec_signal_types(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);

        $keys = SignalTypeDefinition::query()
            ->whereNull('organization_id')
            ->where('pack', SignalTypeDefinition::PACK_DEFAULT)
            ->pluck('key')
            ->all();

        $this->assertEqualsCanonicalizing([
            'new_market_entry',
            'distribution_partnership_announcement',
            'leadership_hire_in_territory',
            'export_trade_activity_mention',
        ], $keys);
    }

    public function test_leadership_hire_is_the_only_default_pack_type_that_feeds_enrichment(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);

        $feedsEnrichment = SignalTypeDefinition::query()
            ->where('pack', SignalTypeDefinition::PACK_DEFAULT)
            ->where('feeds_enrichment', true)
            ->pluck('key')
            ->all();

        $this->assertSame(['leadership_hire_in_territory'], $feedsEnrichment);
    }

    public function test_registry_returns_only_requested_packs(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);

        $registry = new SignalTypeRegistry;
        $result = $registry->activeForPacks(null, [SignalTypeDefinition::PACK_SOFTWARE_DEV]);

        $this->assertCount(5, $result);
        $this->assertTrue($result->every(fn (SignalTypeDefinition $d) => $d->pack === SignalTypeDefinition::PACK_SOFTWARE_DEV));
    }

    public function test_empty_packs_falls_back_to_the_default_pack(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);

        $registry = new SignalTypeRegistry;
        $result = $registry->activeForPacks(null, []);

        $this->assertCount(4, $result);
    }

    public function test_org_specific_row_overrides_the_global_row_with_the_same_key(): void
    {
        $this->seed(SignalTypeDefinitionSeeder::class);
        [, $org] = $this->actingAsOrgMember();

        SignalTypeDefinition::query()->create([
            'organization_id' => $org->id,
            'key' => 'new_market_entry',
            'label' => 'Custom New Market Entry',
            'trigger_description' => 'A customized trigger for this org only.',
            'pack' => SignalTypeDefinition::PACK_DEFAULT,
            'feeds_enrichment' => false,
            'default_recency_window_days' => 30,
            'active' => true,
        ]);

        $registry = new SignalTypeRegistry;
        $result = $registry->activeForPacks($org->id, [SignalTypeDefinition::PACK_DEFAULT]);

        $this->assertCount(4, $result); // still 4 keys, not 5 — override, not addition
        $override = $result->firstWhere('key', 'new_market_entry');
        $this->assertSame('Custom New Market Entry', $override->label);
        $this->assertSame($org->id, $override->organization_id);

        $found = (new SignalTypeRegistry)->find($org->id, 'new_market_entry');
        $this->assertSame('Custom New Market Entry', $found->label);

        $foundForOtherOrg = (new SignalTypeRegistry)->find(null, 'new_market_entry');
        $this->assertSame('New Market Entry', $foundForOtherOrg->label);
    }
}
