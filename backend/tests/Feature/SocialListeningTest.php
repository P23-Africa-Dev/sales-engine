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
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
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
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
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

    public function test_outreach_identity_resolver_falls_back_to_platform_without_domain(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $user = \App\Models\User::query()->first();

        config(['services.sendgrid.platform_from_email' => 'outreach@thefactory23.com']);

        $resolver = app(\App\Services\Outreach\OutreachIdentityResolver::class);
        $identity = $resolver->resolve($org, $user);

        $this->assertSame('platform', $identity->senderType);
        $this->assertSame('outreach@thefactory23.com', $identity->fromEmail);
        $this->assertSame($user->email, $identity->replyTo);
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
            'recommended_action' => 'Reach out within 24 hours. This prospect may be actively looking for solutions.',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/social-listening/signals/{$signal->id}")
            ->assertOk()
            ->assertJsonPath('data.recommendedAction.title', 'Reach out within 24 hours')
            ->assertJsonPath('data.recommendedAction.detail', 'This prospect may be actively looking for solutions.');
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
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 55, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => Http::sequence()
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
                    'date' => '2 days ago',
                ]],
            ], 200),
        ]);

        $orchestrator = app(SocialListeningOrchestrator::class);
        $run = $orchestrator->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(1, $run->signals_created);
        $this->assertSame(1, $run->result_summary['totalChecked']);
        $this->assertSame(1, $run->result_summary['qualified']);
        $this->assertSame(0, $run->result_summary['rejected']['total']);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'api.z.ai')) {
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
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
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
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
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
            ->assertJsonPath('data.freshness_window_days', 180);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/social-listening/settings', [
                'freshness_window_days' => 7,
            ])
            ->assertOk()
            ->assertJsonPath('data.freshness_window_days', 7);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/social-listening/settings', [
                'freshness_window_days' => 90,
            ])
            ->assertOk()
            ->assertJsonPath('data.freshness_window_days', 90);
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

    public function test_run_discards_a_high_scoring_signal_that_fails_the_icp_filter(): void
    {
        // Stage 1 (new_plan.md): "a company can have a strong signal but not match
        // ICP, in which case it's discarded." Social Listening is always ICP-driven
        // (no live chat query behind an automatic scan), so the hard gate must apply
        // even when the enriched signal itself scores well above min_score.
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG Lagos ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 55, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => Http::sequence()
                ->push(['choices' => [['message' => ['content' => json_encode(['queries' => ['fintech startup raises Series A']])]]]])
                ->push([
                    'choices' => [[
                        'message' => ['content' => json_encode([
                            'profile_name' => 'Jane Founder',
                            'persona' => 'Founder',
                            'company_name' => 'Voltify',
                            // Neither the industry nor the territory overlaps the ICP's
                            // FMCG & Retail / Lagos, NG filter — this must be discarded.
                            'location_text' => 'Nairobi, KE',
                            'entity_type' => 'company',
                            'industry' => 'Fintech',
                            'key_topics' => ['funding'],
                            'competitors' => [],
                            'signal_type' => 'funding_event',
                            'buying_stage' => 'N/A',
                            'intent_label' => 'Funding Event',
                            'intent_description' => 'Company raised a Series A round.',
                            'problem' => 'N/A',
                            'urgency' => 'Medium',
                            'buying_intent_score' => 90,
                            'reasons' => ['Strong funding signal.'],
                            'suggested_message' => 'Congrats on the raise.',
                            'recommended_action_title' => 'Review the raise',
                            'recommended_action_detail' => 'Check the term sheet.',
                            'follow_up_strategy' => 'Follow up later.',
                            'summary' => 'Voltify closed a Series A round.',
                            'why_this_matters_to_you' => 'Investment opportunity.',
                            'benefits' => ['Early visibility'],
                            'personal_recommended_action_title' => 'Request an intro',
                            'personal_recommended_action_detail' => 'Ask for a warm intro.',
                        ])],
                    ]],
                ]),
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Voltify raises $8M Series A to expand fintech platform',
                    'snippet' => 'Voltify just closed a Series A funding round.',
                    'link' => 'https://linkedin.com/posts/voltify-raise',
                    'date' => '2 days ago',
                ]],
            ], 200),
        ]);

        $orchestrator = app(SocialListeningOrchestrator::class);
        $run = $orchestrator->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(0, $run->signals_created);
        $this->assertSame(1, $run->result_summary['rejected']['icpMismatch']);
        $this->assertSame(1, $run->result_summary['rejected']['total']);
        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->count());
    }

    public function test_run_discards_a_matching_signal_with_no_source_date(): void
    {
        // Stage 2 mandatory-grounding gate (new_plan.md): "If source_url or
        // source_date is missing, the signal is discarded — not surfaced with
        // lower confidence, discarded." This hit matches the ICP perfectly and
        // would score well, but Serper returned no 'date' field and the URL
        // itself carries no extractable timestamp — it must still be dropped.
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG Lagos ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 40, 'intent_filters' => []],
        ));

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Anyone recommend FMCG logistics software in Lagos?',
                    'snippet' => 'Looking for recommendations on FMCG distribution tools in Lagos.',
                    'link' => 'https://linkedin.com/posts/no-date-1',
                    // deliberately no 'date' field, and the URL has no extractable timestamp.
                ]],
            ], 200),
        ]);

        $orchestrator = app(SocialListeningOrchestrator::class);
        $run = $orchestrator->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertGreaterThanOrEqual(1, $run->signals_created);
        $this->assertSame(0, $run->result_summary['rejected']['missingSourceDate']);

        $signal = SocialSignal::query()->where('organization_id', $org->id)->firstOrFail();
        $this->assertNotNull($signal->posted_at);
        $this->assertSame('inferred', $signal->meta['date_confidence'] ?? null);
    }

    public function test_run_discards_a_signal_older_than_the_freshness_window(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG Lagos ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => [],
                'territories' => [],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'freshness_window_days' => 14, 'intent_filters' => []],
        ));

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Old FMCG partnership announcement',
                    'snippet' => 'A distributor partnership was announced long ago.',
                    'link' => 'https://linkedin.com/posts/stale-1',
                    'date' => '2 years ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(0, $run->signals_created);
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejected']['stale']);
        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->count());
    }

    public function test_general_query_generation_never_sends_structured_icp_fields_to_the_llm(): void
    {
        // new_plan.md's core rule: "ICP fields never get sent as free-text
        // search queries." industries/territories/decisionMakers are Stage 1
        // filter fields — only customPrompt/description may seed query text.
        config(['services.glm.api_key' => 'test-glm-key', 'services.serper.api_key' => 'test-serper-key']);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Distinctive Industry ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['ZzyxxUniqueIndustryTerm'],
                'territories' => ['QqwertTerritoryTerm'],
                'decisionMakers' => ['UniqueDecisionMakerTitle'],
                'customPrompt' => '',
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => Http::response([
                'choices' => [['message' => ['content' => json_encode(['queries' => ['new opportunities this week']])]]],
            ], 200),
            'google.serper.dev/*' => Http::response(['organic' => []], 200),
        ]);

        app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'api.z.ai')) {
                return true;
            }
            $body = $request->body();

            return ! str_contains($body, 'ZzyxxUniqueIndustryTerm')
                && ! str_contains($body, 'QqwertTerritoryTerm')
                && ! str_contains($body, 'UniqueDecisionMakerTitle');
        });
    }

    public function test_icp_filter_enabled_false_bypasses_the_stage_1_gate(): void
    {
        // Operational kill switch (Phase 8): with icp_filter_enabled off, a signal
        // that would normally be discarded for not matching the ICP must still be
        // created — but icp_filter_reasons must honestly show nothing was evaluated,
        // never fabricate a real pass.
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG Lagos ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => [], 'icp_filter_enabled' => false],
        ));

        Http::fake([
            'api.z.ai/*' => Http::sequence()
                ->push(['choices' => [['message' => ['content' => json_encode(['queries' => ['fintech startup raises Series A']])]]]])
                ->push([
                    'choices' => [[
                        'message' => ['content' => json_encode([
                            'company_name' => 'Voltify',
                            'location_text' => 'Nairobi, KE', // mismatched territory
                            'entity_type' => 'company',
                            'industry' => 'Fintech', // mismatched industry
                            'signal_type' => 'funding_event',
                            'summary' => 'Voltify closed a Series A round.',
                        ])],
                    ]],
                ]),
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Voltify raises $8M Series A',
                    'snippet' => 'Voltify just closed a Series A funding round.',
                    'link' => 'https://linkedin.com/posts/kill-switch-1',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(1, $run->signals_created);

        $signal = SocialSignal::query()->where('organization_id', $org->id)->firstOrFail();
        $this->assertTrue($signal->icp_filter_passed);
        $this->assertSame(['industry' => true, 'companySize' => true, 'revenue' => true, 'territory' => true], $signal->icp_filter_reasons);
    }

    public function test_empty_signal_type_packs_default_to_core_buyer_signals(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 1,
        ]);

        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Default ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'signalTypePacks' => [],
                'industries' => [],
                'territories' => [],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Company X registers Kenyan subsidiary to begin local distribution',
                    'snippet' => 'Company X registers a new Kenyan subsidiary.',
                    'link' => 'https://linkedin.com/posts/market-entry-default',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $signal = SocialSignal::query()->where('organization_id', $org->id)->first();
        $this->assertNotNull($signal);
        $this->assertSame('new_market_entry', $signal->signal_type_key);
    }

    public function test_none_pack_disables_discrete_signal_type_queries(): void
    {
        config(['services.glm.api_key' => '', 'services.serper.api_key' => 'test-serper-key']);
        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Opt out ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        $callCount = 0;
        Http::fake([
            'google.serper.dev/*' => function () use (&$callCount) {
                $callCount++;

                return Http::response([
                    'organic' => [[
                        'title' => 'Looking for FMCG distribution software',
                        'snippet' => 'Looking for FMCG distribution software recommendations.',
                        'link' => 'https://linkedin.com/posts/generic-1',
                        'date' => '1 day ago',
                    ]],
                ], 200);
            },
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertGreaterThanOrEqual(1, $callCount);

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'serper')) {
                return true;
            }

            return ! str_contains((string) ($request->data()['q'] ?? ''), 'New Market Entry');
        });

        $signal = SocialSignal::query()->where('organization_id', $org->id)->first();
        $this->assertNotNull($signal);
        $this->assertNull($signal->signal_type_key);
    }

    public function test_signal_type_queries_tag_signals_when_an_icp_opts_into_a_pack(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 1,
        ]);

        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Market Entry ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => [],
                'territories' => [],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_DEFAULT],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'google.serper.dev/*' => function ($request) {
                $body = $request->data();
                $isSignalTypeQuery = str_contains((string) ($body['q'] ?? ''), 'New Market Entry');

                return Http::response([
                    'organic' => [[
                        'title' => $isSignalTypeQuery ? 'Company X opens Kenyan subsidiary' : 'Looking for recommendations',
                        'snippet' => $isSignalTypeQuery
                            ? 'Company X registers a new Kenyan subsidiary to begin local distribution.'
                            : 'Looking for FMCG distribution software recommendations.',
                        'link' => $isSignalTypeQuery
                            ? 'https://linkedin.com/posts/market-entry-1'
                            : 'https://linkedin.com/posts/generic-2',
                        'date' => '1 day ago',
                    ]],
                ], 200);
            },
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);

        $tagged = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('post_url', 'https://linkedin.com/posts/market-entry-1')
            ->first();

        $this->assertNotNull($tagged);
        $this->assertSame('new_market_entry', $tagged->signal_type_key);

        $generic = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('post_url', 'https://linkedin.com/posts/generic-2')
            ->first();
        if ($generic !== null) {
            $this->assertNull($generic->signal_type_key);
        }
    }

    public function test_leadership_hire_signal_captures_named_people_end_to_end(): void
    {
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 4,
        ]);

        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Leadership Hire ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => [],
                'territories' => [],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_DEFAULT],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => function ($request) {
                $body = $request->body();

                // First GLM call is buildQueries(); subsequent calls are per-hit enrich().
                if (str_contains($body, 'Generate 3-5 short Google search queries')) {
                    return Http::response(['choices' => [['message' => ['content' => json_encode(['queries' => ['fallback query']])]]]], 200);
                }

                if (str_contains($body, 'Decide whether a post is a genuine match')) {
                    return Http::response(['choices' => [['message' => ['content' => json_encode([
                        'matched' => true,
                        'company' => 'Acme Corp',
                        'description' => 'Jane Doe appointed Country Manager for Kenya, replacing John Smith.',
                        'source_url' => 'https://linkedin.com/posts/leadership-hire-1',
                        'source_date' => now()->subDay()->toDateString(),
                        'territory' => 'Kenya',
                        'named_people' => ['Jane Doe', 'John Smith'],
                    ])]]]], 200);
                }

                return Http::response([
                    'choices' => [[
                        'message' => ['content' => json_encode([
                            'profile_name' => 'Jane Doe',
                            'company_name' => 'Acme Corp',
                            'entity_type' => 'company',
                            'location_text' => 'Kenya',
                            'signal_type' => 'hiring_expansion',
                            'named_people' => ['Jane Doe', 'John Smith'],
                            'summary' => 'Jane Doe appointed Country Manager for Kenya, replacing John Smith.',
                        ])],
                    ]],
                ], 200);
            },
            'google.serper.dev/*' => function ($request) {
                $body = $request->data();
                $isLeadershipHireQuery = str_contains((string) ($body['q'] ?? ''), 'Leadership Hire in Territory');

                if (! $isLeadershipHireQuery) {
                    return Http::response(['organic' => []], 200);
                }

                return Http::response([
                    'organic' => [[
                        'title' => 'Jane Doe appointed Country Manager for Kenya',
                        'snippet' => 'Jane Doe appointed Country Manager for Kenya, replacing John Smith.',
                        'link' => 'https://linkedin.com/posts/leadership-hire-1',
                        'date' => '1 day ago',
                    ]],
                ], 200);
            },
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);

        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('post_url', 'https://linkedin.com/posts/leadership-hire-1')
            ->first();

        $this->assertNotNull($signal);
        $this->assertSame('leadership_hire_in_territory', $signal->signal_type_key);
        $this->assertSame(['Jane Doe', 'John Smith'], $signal->named_people);
    }

    public function test_default_packs_still_search_icp_interest_queries(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 1,
        ]);
        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Fintech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'mobile fintech partnerships',
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_DEFAULT],
                'industries' => [],
                'territories' => [],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        $sawInterest = false;
        Http::fake([
            'google.serper.dev/*' => function ($request) use (&$sawInterest) {
                $query = (string) ($request->data()['q'] ?? '');
                if (str_contains(mb_strtolower($query), 'fintech')) {
                    $sawInterest = true;
                }

                return Http::response(['organic' => []], 200);
            },
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertTrue($sawInterest);
    }

    public function test_type_mismatch_is_kept_as_an_icp_opportunity(): void
    {
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 1,
        ]);
        $this->seed(\Database\Seeders\SignalTypeDefinitionSeeder::class);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Opportunity ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'fintech partnerships',
                'industries' => [],
                'territories' => [],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_DEFAULT],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => function ($request) {
                $body = $request->body();
                if (str_contains($body, 'Generate 3-5 short Google search queries')) {
                    return Http::response(['choices' => [['message' => ['content' => json_encode(['queries' => ['fintech partnership']])]]]], 200);
                }
                if (str_contains($body, 'Decide whether a post is a genuine match')) {
                    return Http::response(['choices' => [['message' => ['content' => json_encode([
                        'matched' => false,
                        'reject_reason' => 'type_mismatch',
                    ])]]]], 200);
                }

                return Http::response(['choices' => [['message' => ['content' => json_encode([
                    'company_name' => 'Acme',
                    'signal_type' => 'partnership_opportunity',
                    'buying_intent_score' => 80,
                    'summary' => 'Acme is looking for a fintech partner.',
                    'intent_label' => 'Partnership',
                    'location_text' => '',
                    'industry' => '',
                ])]]]], 200);
            },
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Acme seeking fintech partner',
                    'snippet' => 'Acme announced it is looking for a fintech partner this week.',
                    'link' => 'https://linkedin.com/posts/opportunity-1',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $signal = SocialSignal::query()->where('post_url', 'https://linkedin.com/posts/opportunity-1')->first();
        $this->assertNotNull($signal);
        $this->assertNull($signal->signal_type_key);
        $this->assertSame(0, $run->result_summary['rejected']['typeMismatch']);
    }

    public function test_missing_industry_does_not_fail_the_icp_filter(): void
    {
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'api.z.ai/*' => Http::sequence()
                ->push(['choices' => [['message' => ['content' => json_encode(['queries' => ['fmcg lagos']])]]]])
                ->push(['choices' => [['message' => ['content' => json_encode([
                    'company_name' => 'ShopCo',
                    'industry' => '',
                    'location_text' => '',
                    'signal_type' => 'partnership_opportunity',
                    'buying_intent_score' => 77,
                    'summary' => 'Looking for a distribution partner.',
                ])]]]]),
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Looking for a distribution partner',
                    'snippet' => 'We are expanding and looking for a partner.',
                    'link' => 'https://linkedin.com/posts/no-industry',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertSame(1, $run->signals_created);
        $this->assertSame(0, $run->result_summary['rejected']['icpMismatch']);
    }

    public function test_missing_optional_keys_do_not_block_serper_sources(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
            'services.youtube.api_key' => '',
            'services.reddit.client_id' => '',
            'services.reddit.client_secret' => '',
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => [],
                'territories' => [],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Looking for CRM recommendations in Lagos',
                    'snippet' => 'Looking for CRM recommendations in Lagos',
                    'link' => 'https://linkedin.com/posts/serper-only',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertGreaterThanOrEqual(1, $run->signals_created);
        $sources = collect($run->result_summary['sources'] ?? [])->keyBy('key');
        $this->assertSame('missing_key', $sources['youtube']['status'] ?? null);
        $this->assertSame('missing_key', $sources['reddit_native']['status'] ?? null);
        $this->assertSame('live', $sources['linkedin_public']['status'] ?? null);
    }

    public function test_daily_cap_soft_completes_instead_of_failing_the_run(): void
    {
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.daily_api_cap' => 1,
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30],
        ));

        \App\Models\ApiUsage::query()->create([
            'organization_id' => $org->id,
            'provider' => 'serper',
            'endpoint' => 'social_linkedin_public',
            'units' => 1,
            'estimated_cost' => 0,
        ]);

        Http::fake();

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $this->assertNull($run->error);
        $this->assertTrue($run->result_summary['budget_exhausted']);
        $this->assertSame(0, $run->signals_created);
    }
}
