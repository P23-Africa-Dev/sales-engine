<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SocialListeningTest extends TestCase
{
    public function test_signals_list_requires_active_icp(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/signals')
            ->assertStatus(422);
    }

    public function test_social_listening_run_enqueues_job(): void
    {
        config(['services.serper.api_key' => 'test-serper']);

        Queue::fake();

        [, $org] = $this->actingAsOrgMember();

        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/social-listening/runs', ['force' => true])
            ->assertCreated();

        Queue::assertPushed(\App\Jobs\RunSocialListeningJob::class);
    }

    public function test_social_listening_bootstrap_is_idempotent(): void
    {
        Queue::fake();

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialListeningSetting::query()->create(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id)
        );

        $headers = $this->orgHeaders($org);

        $this->withHeaders($headers)
            ->postJson('/api/v1/social-listening/runs/bootstrap')
            ->assertCreated()
            ->assertJsonPath('data.bootstrapped', true);

        Queue::assertPushed(\App\Jobs\RunSocialListeningJob::class, 1);

        SocialListeningRun::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'status' => 'completed',
            'signals_created' => 0,
            'finished_at' => now(),
        ]);

        SocialListeningSetting::query()
            ->where('organization_id', $org->id)
            ->where('icp_profile_id', $icp->id)
            ->update(['last_run_at' => now()]);

        $this->withHeaders($headers)
            ->postJson('/api/v1/social-listening/runs/bootstrap')
            ->assertOk()
            ->assertJsonPath('data.bootstrapped', false);

        Queue::assertPushed(\App\Jobs\RunSocialListeningJob::class, 1);
    }

    public function test_social_listening_metrics_includes_run_status(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialListeningSetting::query()->create(
            array_merge(SocialListeningSetting::defaultsForOrg($org->id, $icp->id), [
                'last_run_at' => now()->subDay(),
            ])
        );

        SocialListeningRun::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'status' => 'completed',
            'signals_created' => 2,
            'result_summary' => 'Created 2 social signals from 5 raw hits.',
            'finished_at' => now(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/metrics')
            ->assertOk()
            ->assertJsonPath('data.latest_run.status', 'completed')
            ->assertJsonPath('data.latest_run.signals_created', 2)
            ->assertJsonStructure([
                'data' => ['last_run_at', 'latest_run' => ['id', 'status', 'stages']],
            ]);
    }

    public function test_default_min_score_allows_heuristic_signals(): void
    {
        $defaults = SocialListeningSetting::defaultsForOrg(1, 1);

        $this->assertSame(55, $defaults['min_score']);
    }

    public function test_heuristic_enriched_score_passes_default_min_score(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        config(['services.glm.api_key' => '']);

        $hit = new \App\Services\Intent\DTO\RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn Post',
            sourceIcon: 'in',
            postText: 'Looking for CRM recommendations in Lagos',
            postUrl: 'https://linkedin.com/posts/x',
            snippet: 'Looking for CRM recommendations in Lagos',
            title: 'Post',
        );

        $enriched = app(\App\Services\Intent\SocialSignalEnricher::class)->enrich($org, $icp, $hit);
        $defaults = SocialListeningSetting::defaultsForOrg($org->id, $icp->id);

        $this->assertGreaterThanOrEqual($defaults['min_score'], (float) $enriched['score']);
    }

    public function test_social_signal_enricher_heuristic(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        config(['services.glm.api_key' => '']);

        $hit = new \App\Services\Intent\DTO\RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn Post',
            sourceIcon: 'in',
            postText: 'Looking for CRM recommendations in Lagos',
            postUrl: 'https://linkedin.com/posts/x',
            snippet: 'Looking for CRM recommendations in Lagos',
            title: 'Post',
        );

        $enriched = app(\App\Services\Intent\SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertArrayHasKey('score', $enriched);
        $this->assertNotEmpty($enriched['suggested_message']);
    }

    public function test_social_listening_metrics(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Need CRM recommendations',
            'score' => 75,
            'status' => 'new',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/metrics')
            ->assertOk()
            ->assertJsonPath('data.signals_detected', 1);
    }

    public function test_outreach_identity_resolver_defaults_to_platform(): void
    {
        [, $org] = $this->actingAsOrgMember();
        config(['services.sendgrid.platform_from_email' => 'outreach@thefactory23.com']);

        $resolver = app(\App\Services\Outreach\OutreachIdentityResolver::class);
        $identity = $resolver->resolve($org, \App\Models\User::query()->first());

        $this->assertSame('platform', $identity->senderType);
        $this->assertSame('outreach@thefactory23.com', $identity->fromEmail);
    }

    public function test_signals_list_supports_filters_and_pagination(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Need CRM recommendations',
            'signal_type' => 'Recommendation',
            'buying_stage' => 'Consideration',
            'score' => 80,
            'status' => 'new',
        ]);

        SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'reddit',
            'source_label' => 'Reddit Post',
            'source_icon' => 'r',
            'post_text' => 'Switching CRM tools',
            'signal_type' => 'Switching',
            'buying_stage' => 'Vendor Evaluation',
            'score' => 60,
            'status' => 'new',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/signals?signal_type=Switching&per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.signalType', 'Switching');
    }
}
