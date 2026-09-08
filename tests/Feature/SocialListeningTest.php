<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Intent\SocialListeningOrchestrator;
use Illuminate\Support\Facades\Http;
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

    public function test_signal_resource_exposes_recommended_action_as_object_from_split_columns(): void
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
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Just closed our Series A',
            'signal_type' => 'funding_event',
            'score' => 80,
            'status' => 'new',
            'recommended_action_title' => 'Review the raise',
            'recommended_action_detail' => 'Check the term sheet and reach out to the founder.',
            'why_this_matters_to_you' => 'This matches your interest in early-stage tech investments.',
            'benefits' => ['Early access to a hot round'],
            'personal_recommended_action_title' => 'Request an intro',
            'personal_recommended_action_detail' => 'Ask a mutual connection for a warm intro this week.',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/social-listening/signals/{$signal->id}")
            ->assertOk()
            ->assertJsonPath('data.recommendedAction.title', 'Review the raise')
            ->assertJsonPath('data.recommendedAction.detail', 'Check the term sheet and reach out to the founder.')
            ->assertJsonPath('data.personalRecommendedAction.title', 'Request an intro')
            ->assertJsonPath('data.whyThisMattersToYou', 'This matches your interest in early-stage tech investments.')
            ->assertJsonPath('data.benefits.0', 'Early access to a hot round');
    }

    public function test_signal_resource_splits_legacy_flat_recommended_action_string(): void
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
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Legacy row',
            'signal_type' => 'recommendation',
            'score' => 70,
            'status' => 'new',
            'recommended_action' => 'Reach out within 24 hours — this prospect may be actively looking for solutions.',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/social-listening/signals/{$signal->id}")
            ->assertOk()
            ->assertJsonPath('data.recommendedAction.title', 'Reach out within 24 hours')
            ->assertJsonPath('data.recommendedAction.detail', 'this prospect may be actively looking for solutions.');
    }

    public function test_filter_no_longer_drops_funding_signal_when_filters_empty_and_score_passes(): void
    {
        $orchestrator = app(\App\Services\Intent\SocialListeningOrchestrator::class);
        $reflection = new \ReflectionClass($orchestrator);
        $method = $reflection->getMethod('matchesIntentFilters');
        $method->setAccessible(true);

        $enriched = ['signal_type' => 'funding_event'];

        $this->assertTrue($method->invoke($orchestrator, $enriched, []));
        $this->assertTrue($method->invoke($orchestrator, $enriched, ['funding_event']));
        $this->assertFalse($method->invoke($orchestrator, $enriched, ['recommendation']));
    }

    public function test_default_intent_filters_do_not_exclude_new_opportunity_types(): void
    {
        $defaults = SocialListeningSetting::defaultsForOrg(1, 1);

        $this->assertSame([], $defaults['intent_filters']);
    }

    public function test_investment_style_custom_prompt_produces_and_keeps_funding_signal_end_to_end(): void
    {
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Investor Radar',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'I want high-conviction tech investment opportunities outside my home market.',
                'industries' => [],
                'territories' => [],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 55, 'intent_filters' => []],
        ));

        Http::fake([
            'open.bigmodel.cn/*' => Http::sequence()
                // 1) buildQueries() call — assert custom_prompt was sent, return an investment-flavored query.
                ->push([
                    'choices' => [[
                        'message' => ['content' => json_encode(['queries' => ['tech startup raises Series A funding']])],
                    ]],
                ])
                // 2) enrich() call for the single hit — full GLM-shaped payload.
                ->push([
                    'choices' => [[
                        'message' => ['content' => json_encode([
                            'profile_name' => 'Jane Founder',
                            'persona' => 'Founder',
                            'company_name' => 'Voltify',
                            'location_text' => 'Nairobi, KE',
                            'entity_type' => 'company',
                            'industry' => 'Fintech',
                            'key_topics' => ['funding', 'expansion'],
                            'competitors' => [],
                            'signal_type' => 'funding_event',
                            'buying_stage' => 'N/A',
                            'intent_label' => 'Funding Event',
                            'intent_description' => 'Company raised a Series A round.',
                            'problem' => 'N/A',
                            'urgency' => 'Medium',
                            'buying_intent_score' => 82,
                            'reasons' => ['Matches your interest in high-conviction tech investments outside your home market.'],
                            'suggested_message' => 'Congrats on the raise — would love to learn more.',
                            'recommended_action_title' => 'Review the raise',
                            'recommended_action_detail' => 'Check the term sheet and investor list.',
                            'follow_up_strategy' => 'Follow up after their next funding announcement.',
                            'summary' => 'Voltify closed a Series A round to expand into new markets.',
                            'why_this_matters_to_you' => 'This is a high-conviction tech investment opportunity outside your home market, matching what you asked for.',
                            'benefits' => ['Early visibility into a funded startup', 'Direct founder access'],
                            'personal_recommended_action_title' => 'Request an intro',
                            'personal_recommended_action_detail' => 'Ask your network for a warm intro to Jane this week.',
                        ])],
                    ]],
                ]),
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Voltify raises $8M Series A to expand fintech platform',
                    'snippet' => 'Voltify just closed a Series A funding round led by top investors to expand into new markets.',
                    'link' => 'https://linkedin.com/posts/voltify-raise',
                ]],
            ], 200),
        ]);

        $orchestrator = app(SocialListeningOrchestrator::class);
        $run = $orchestrator->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(1, $run->signals_created);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'bigmodel.cn')) {
                return true;
            }
            $body = $request->body();

            return str_contains($body, 'high-conviction tech investment opportunities outside my home market');
        });

        $signal = SocialSignal::query()->where('organization_id', $org->id)->firstOrFail();

        $this->assertSame('funding_event', $signal->signal_type);
        $this->assertSame('company', $signal->entity_type);
        $this->assertSame('Fintech', $signal->industry);
        $this->assertSame(['funding', 'expansion'], $signal->key_topics);
        $this->assertSame('Review the raise', $signal->recommended_action_title);
        $this->assertSame('Request an intro', $signal->personal_recommended_action_title);
        $this->assertNotEmpty($signal->why_this_matters_to_you);
        $this->assertSame(['Early visibility into a funded startup', 'Direct founder access'], $signal->benefits);
        $this->assertGreaterThanOrEqual(55, (float) $signal->score);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/social-listening/signals/{$signal->id}")
            ->assertOk()
            ->assertJsonPath('data.signalType', 'funding_event')
            ->assertJsonPath('data.recommendedAction.title', 'Review the raise')
            ->assertJsonPath('data.personalRecommendedAction.title', 'Request an intro')
            ->assertJsonPath('data.entityType', 'company')
            ->assertJsonPath('data.keyTopics.0', 'funding');
    }

    public function test_serper_search_sends_tbs_and_persists_parsed_posted_at(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Anyone recommend FMCG logistics software in Lagos?',
                    'link' => 'https://linkedin.com/posts/fresh-1',
                    'snippet' => 'Looking for recommendations on FMCG distribution tools in Lagos.',
                    'date' => '2 days ago',
                ]],
            ], 200),
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['min_score' => 40, 'freshness_window_days' => 14]
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertGreaterThan(0, $run->signals_created);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'google.serper.dev')) {
                return true;
            }
            $data = $request->data();

            return ($data['tbs'] ?? null) === 'qdr:m';
        });

        $signal = SocialSignal::query()->where('organization_id', $org->id)->firstOrFail();
        $this->assertNotNull($signal->posted_at);
        $this->assertTrue($signal->posted_at->greaterThan(now()->subDays(5)));
        $this->assertSame('2 days ago', $signal->meta['date_raw'] ?? null);
    }

    public function test_stale_dated_hits_are_not_created(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Anyone recommend FMCG logistics software in Lagos?',
                    'link' => 'https://linkedin.com/posts/stale-1',
                    'snippet' => 'Looking for recommendations on FMCG distribution tools in Lagos.',
                    'date' => '40 days ago',
                ]],
            ], 200),
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['min_score' => 40, 'freshness_window_days' => 14]
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(0, $run->signals_created);
        $this->assertDatabaseCount('social_signals', 0);
    }

    public function test_signals_list_orders_by_score_then_posted_at_and_supports_max_age(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $older = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Older same score',
            'score' => 80,
            'status' => 'new',
            'posted_at' => now()->subDays(5),
        ]);

        $newer = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Newer same score',
            'score' => 80,
            'status' => 'new',
            'posted_at' => now()->subHours(6),
        ]);

        $stale = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Too old for max_age filter',
            'score' => 80,
            'status' => 'new',
            'posted_at' => now()->subDays(30),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/signals?per_page=10')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.1.id', $older->id)
            ->assertJsonPath('data.2.id', $stale->id);

        $filtered = $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/signals?max_age_days=7')
            ->assertOk();

        $ids = collect($filtered->json('data'))->pluck('id')->all();
        $this->assertSame([$newer->id, $older->id], $ids);
        $this->assertSame(2, $filtered->json('meta.total'));
    }

    public function test_settings_include_freshness_window_days(): void
    {
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

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/settings')
            ->assertOk()
            ->assertJsonPath('data.freshness_window_days', 14);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/social-listening/settings', [
                'freshness_window_days' => 7,
            ])
            ->assertOk()
            ->assertJsonPath('data.freshness_window_days', 7);
    }

    public function test_settings_persist_meta_page_ids(): void
    {
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

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/settings')
            ->assertOk()
            ->assertJsonPath('data.meta_page_ids', []);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/social-listening/settings', [
                'enabled_sources' => ['meta_graph_pages', 'linkedin_public'],
                'meta_page_ids' => ['@AcmeCorp', ' 123456789 ', '', 'competitor-page'],
            ])
            ->assertOk()
            ->assertJsonPath('data.meta_page_ids', ['AcmeCorp', '123456789', 'competitor-page'])
            ->assertJsonPath('data.enabled_sources', ['meta_graph_pages', 'linkedin_public']);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/social-listening/settings')
            ->assertOk()
            ->assertJsonPath('data.meta_page_ids', ['AcmeCorp', '123456789', 'competitor-page']);
    }
}
