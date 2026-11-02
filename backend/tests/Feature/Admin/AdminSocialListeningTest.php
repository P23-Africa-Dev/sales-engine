<?php

namespace Tests\Feature\Admin;

use App\Jobs\RunSocialListeningJob;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\SocialSignal;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSocialListeningTest extends TestCase
{
    public function test_client_user_cannot_access_admin_social_listening(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/admin/social-listening/overview')->assertForbidden();
    }

    public function test_admin_can_review_pause_and_queue_runs(): void
    {
        Queue::fake();
        $admin = PlatformAdmin::factory()->create();
        Sanctum::actingAs($admin);

        $org = Organization::query()->create([
            'name' => 'Listen Co',
            'slug' => 'listen-co',
            'status' => 'active',
        ]);
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Active ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'content_hash' => 'hash-admin-1',
            'post_url' => 'https://example.com/post/1',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn',
            'source_icon' => 'in',
            'score' => 88,
            'company_name' => 'Signal Corp',
            'post_text' => 'Hiring sales ops',
            'status' => 'new',
        ]);

        $this->getJson('/api/v1/admin/social-listening/overview')
            ->assertOk()
            ->assertJsonPath('data.totals.needs_review', 1);

        $this->getJson('/api/v1/admin/social-listening/signals')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.admin_status', 'Needs review');

        $this->postJson('/api/v1/admin/social-listening/signals/review', [
            'ids' => [$signal->id],
            'status' => 'reviewed',
            'reason' => 'Matches ICP hiring intent',
        ])->assertOk()
            ->assertJsonPath('data.updated', 1);

        $this->assertSame('reviewed', $signal->fresh()->status);

        $this->postJson('/api/v1/admin/organizations/'.$org->id.'/social-listening/pause', [
            'reason' => 'Noise spike',
        ])->assertOk();

        $this->postJson('/api/v1/admin/organizations/'.$org->id.'/social-listening/resume', [
            'reason' => 'Resolved',
        ])->assertOk();

        $this->postJson('/api/v1/admin/organizations/'.$org->id.'/social-listening/runs', [
            'icp_profile_id' => $icp->id,
            'force' => true,
        ])->assertCreated();

        Queue::assertPushed(RunSocialListeningJob::class);
    }
}
