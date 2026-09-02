<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class IcpProfileTest extends TestCase
{
    public function test_create_first_icp_is_active(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/icp-profiles', [
                'name' => 'FMCG Distributors',
                'description' => 'Tier-1 distributors',
                'config' => [
                    'industries' => ['FMCG & Retail'],
                    'territories' => ['Lagos, NG'],
                    'minMatchScore' => 75,
                    'autoSyncCrm' => true,
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'FMCG Distributors')
            ->assertJsonPath('data.isActive', true)
            ->assertJsonPath('data.config.minMatchScore', 75);
    }

    public function test_activate_enforces_single_active_icp(): void
    {
        Queue::fake();

        [, $org] = $this->actingAsOrgMember();

        $a = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'A',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        $b = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'B',
            'is_active' => false,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/icp-profiles/{$b->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.isActive', true);

        $this->assertFalse($a->fresh()->is_active);
        $this->assertTrue($b->fresh()->is_active);
        $this->assertSame(1, IcpProfile::query()->where('organization_id', $org->id)->where('is_active', true)->count());

        Queue::assertPushed(\App\Jobs\RunSocialListeningJob::class);
    }

    public function test_org_isolation_blocks_cross_org_icp_access(): void
    {
        [, $orgA] = $this->actingAsOrgMember();
        [, $orgB] = $this->createUserWithOrg([], ['name' => 'Other', 'slug' => 'other-'.uniqid()]);

        $foreign = IcpProfile::query()->create([
            'organization_id' => $orgB->id,
            'name' => 'Secret',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $this->withHeaders($this->orgHeaders($orgA))
            ->getJson("/api/v1/icp-profiles/{$foreign->id}")
            ->assertNotFound();
    }

    public function test_duplicate_creates_inactive_copy(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $profile = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Original',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), ['industries' => ['Fintech']]),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/icp-profiles/{$profile->id}/duplicate")
            ->assertCreated()
            ->assertJsonPath('data.name', 'Original (Copy)')
            ->assertJsonPath('data.isActive', false)
            ->assertJsonPath('data.config.industries.0', 'Fintech');
    }
}
