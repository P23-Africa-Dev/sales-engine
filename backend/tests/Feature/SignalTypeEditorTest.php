<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\SignalDetection\SignalQueryBuilder;
use App\Services\SignalDetection\SignalTypeRegistry;
use Database\Seeders\SignalTypeDefinitionSeeder;
use Tests\TestCase;

/**
 * "Different client or industry: reuse the same architecture but change the signal definitions."
 */
class SignalTypeEditorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SignalTypeDefinitionSeeder::class);
    }

    public function test_lists_built_in_types_including_the_manufacturing_template(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $keys = collect($this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/signal-types/manage')->assertOk()->json('data'))->pluck('key');

        $this->assertContains('new_market_entry', $keys);
        $this->assertContains('trade_fair_exhibitor', $keys);
        $this->assertContains('local_plant_or_assembly', $keys);
    }

    public function test_editing_a_built_in_type_only_changes_it_for_this_organisation(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $other = Organization::query()->create(['name' => 'Other', 'slug' => 'other-'.uniqid()]);

        $this->withHeaders($this->orgHeaders($org))->putJson('/api/v1/signal-types/new_market_entry', [
            'label' => 'Expansion into Africa',
            'recencyWindowDays' => 90,
            'targetRoles' => ['Export Director', ''],
        ])->assertOk()->assertJsonPath('data.isOwn', true)->assertJsonPath('data.targetRoles', ['Export Director']);

        $registry = new SignalTypeRegistry;
        $mine = $registry->find($org->id, 'new_market_entry');
        $this->assertSame('Expansion into Africa', $mine->label);
        $this->assertSame(90, $mine->default_recency_window_days);
        $this->assertSame('New Market Entry', $registry->find($other->id, 'new_market_entry')->label);
        $this->assertSame('New Market Entry', SignalTypeDefinition::query()->whereNull('organization_id')->where('key', 'new_market_entry')->value('label'));
    }

    public function test_switching_a_built_in_type_off_hides_it_from_scans(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $other = Organization::query()->create(['name' => 'Other', 'slug' => 'other-'.uniqid()]);

        $this->withHeaders($this->orgHeaders($org))->putJson('/api/v1/signal-types/hiring_job_post', ['active' => false])->assertOk();

        $registry = new SignalTypeRegistry;
        $this->assertNotContains('hiring_job_post', $registry->activeForPacks($org->id, ['default'])->pluck('key'));
        $this->assertContains('hiring_job_post', $registry->activeForPacks($other->id, ['default'])->pluck('key'));
    }

    public function test_custom_type_is_searched_with_its_own_phrasing(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $key = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/signal-types', [
            'label' => 'Government tender win',
            'triggerDescription' => 'A named company wins a public tender in the territory.',
            'searchPhrases' => ['{industry} wins tender {territory}'],
            'recencyWindowDays' => 60,
        ])->assertCreated()->json('data.key');

        $this->assertSame('custom_government_tender_win', $key);
        $definition = (new SignalTypeRegistry)->activeForPacks($org->id, ['default'])->firstWhere('key', $key);
        $this->assertNotNull($definition);

        $brief = new IcpBrief(name: 'ICP', description: '', industries: ['Construction'], territories: ['Ghana'], companySizes: [], decisionMakers: [], customPrompt: '', minMatchScore: 60, autoSyncCrm: false, query: '');
        $this->assertSame(['Construction wins tender Ghana'], (new SignalQueryBuilder)->buildEventQueries($definition, $brief));
    }

    public function test_deleting_reverts_an_edit_and_removes_a_custom_type(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $headers = $this->orgHeaders($org);
        $this->withHeaders($headers)->putJson('/api/v1/signal-types/new_market_entry', ['label' => 'Edited'])->assertOk();

        $this->withHeaders($headers)->deleteJson('/api/v1/signal-types/new_market_entry')->assertOk()->assertJsonPath('data.builtIn', true);
        $this->assertSame('New Market Entry', (new SignalTypeRegistry)->find($org->id, 'new_market_entry')->label);

        $this->withHeaders($headers)->deleteJson('/api/v1/signal-types/new_market_entry')->assertNotFound();
    }

    public function test_input_is_validated(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/signal-types', [
            'label' => 'X',
            'triggerDescription' => 'Y',
            'pack' => 'not_a_pack',
            'recencyWindowDays' => 900,
        ])->assertUnprocessable()->assertJsonValidationErrors(['pack', 'recencyWindowDays']);
    }
}
