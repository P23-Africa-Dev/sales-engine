<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\OpportunityGate;
use App\Services\Intent\OpportunityPrefilter;
use App\Services\Intent\RedditPostHydrator;
use App\Services\Intent\SocialListeningOrchestrator;
use App\Services\Intent\SocialPostDateParser;
use App\Services\SignalDetection\IcpOpportunityQueryBuilder;
use Carbon\Carbon;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SocialListeningUpgradeTest extends TestCase
{
    private function fleetProfile(): ListeningProfile
    {
        return new ListeningProfile(
            mode: 'sell',
            offer: 'fleet tracking',
            competitors: ['Samsara'],
            includeHiring: false,
            territories: ['Lagos'],
            synonyms: ['GPS tracker', 'vehicle tracking'],
            painPhrases: ['drivers keep faking fuel receipts'],
            communities: ['logistics'],
            excludeTerms: ['toy'],
        );
    }

    public function test_plan_covers_every_query_family(): void
    {
        $plan = (new IcpOpportunityQueryBuilder)->plan($this->fleetProfile());
        $families = array_unique(array_column($plan, 'family'));

        foreach (['ask', 'evaluate', 'competitor', 'pain', 'community'] as $family) {
            $this->assertContains($family, $families);
        }

        $community = collect($plan)->firstWhere('family', 'community');
        $this->assertStringStartsWith('site:reddit.com/r/logistics', $community['query']);
        $this->assertSame('subreddit:logistics "fleet tracking"', $community['native']);
        $this->assertSame(['reddit', 'reddit_native'], $community['only_sources']);

        $ask = collect($plan)->firstWhere('family', 'ask');
        $this->assertStringContainsString('-jobs', $ask['query']);
        $this->assertStringContainsString('-toy', $ask['query']);
        $this->assertStringNotContainsString('-jobs', $ask['native']);
    }

    public function test_x_status_urls_carry_their_own_post_time(): void
    {
        $posted = (new SocialPostDateParser)->fromXStatusUrl('https://x.com/jack/status/1800000000000000000');

        $this->assertNotNull($posted);
        $this->assertSame('2024-06-10', $posted->toDateString());
        $this->assertNull((new SocialPostDateParser)->fromXStatusUrl('https://x.com/jack'));
    }

    public function test_pain_post_without_ask_words_reaches_the_model(): void
    {
        $hit = $this->hit('Our drivers keep faking fuel receipts and it is eating our margins on every Lagos route this month.');

        $this->assertTrue((new OpportunityPrefilter)->accepts($hit, $this->fleetProfile()));
    }

    public function test_vendor_promotion_and_excluded_terms_are_dropped(): void
    {
        $prefilter = new OpportunityPrefilter;

        $promo = $this->hit('Looking for fleet tracking? Our platform helps logistics teams cut fuel theft. Book a demo today.');
        $this->assertSame('self_promotion', $prefilter->rejection($promo, $this->fleetProfile()));

        $toy = $this->hit('Looking for a fleet tracking toy car set for my son, any recommendations from other parents here?');
        $this->assertSame('excluded_term', $prefilter->rejection($toy, $this->fleetProfile()));
    }

    public function test_quote_with_small_differences_still_counts(): void
    {
        $text = "Anyone recommend a fleet-tracking tool that works in Lagos? We've got 40 trucks and Samsara is too expensive.";
        $quote = 'Anyone recommend a fleet tracking tool that works in Lagos';

        $this->assertNull((new OpportunityGate)->rejection([
            'actionability' => 'reply_now',
            'signal_type' => 'recommendation',
            'evidence_quote' => $quote,
            'author_role' => 'buyer',
        ], $text, $this->fleetProfile()));
    }

    public function test_vendor_and_news_authors_are_not_buyers(): void
    {
        $gate = new OpportunityGate;
        $text = 'Anyone recommend a fleet tracking tool that works in Lagos? We have 40 trucks on the road.';
        $base = [
            'actionability' => 'reply_now',
            'signal_type' => 'recommendation',
            'evidence_quote' => 'Anyone recommend a fleet tracking tool that works in Lagos?',
        ];

        $this->assertSame('not_a_buyer', $gate->rejection($base + ['author_role' => 'vendor'], $text, $this->fleetProfile()));
        $this->assertSame('not_a_buyer', $gate->rejection($base + ['author_role' => 'news'], $text, $this->fleetProfile()));

        $invest = new ListeningProfile('invest', 'fintech', [], false, []);
        $funding = 'Voltify just closed a Series A funding round led by top investors to expand into new markets this week.';
        $this->assertNull($gate->rejection([
            'actionability' => 'reply_now',
            'signal_type' => 'funding_event',
            'evidence_quote' => $funding,
            'author_role' => 'news',
        ], $funding, $invest));
    }

    public function test_confirmed_signal_type_event_passes_without_a_buyer_ask(): void
    {
        $gate = new OpportunityGate;
        $text = 'Atlas Compressors opens a Nairobi subsidiary to serve East African construction firms.';
        $event = [
            'actionability' => 'not_an_opportunity',
            'signal_type' => 'market_signal',
            'evidence_quote' => '',
            'author_role' => 'news',
        ];

        $this->assertSame('not_an_opportunity', $gate->rejection($event, $text, $this->fleetProfile()));
        $this->assertNull($gate->rejection($event, $text, $this->fleetProfile(), confirmedSignalType: true));
        $this->assertSame('not_a_buyer', $gate->rejection(
            ['author_role' => 'recruiter'] + $event,
            $text,
            $this->fleetProfile(),
            confirmedSignalType: true,
        ));
        $this->assertSame('not_an_opportunity', $gate->rejection(
            ['from_heuristic' => true] + $event,
            $text,
            $this->fleetProfile(),
            confirmedSignalType: true,
        ));
    }

    public function test_signal_type_hit_skips_only_the_topic_cue_check(): void
    {
        $prefilter = new OpportunityPrefilter;
        $event = $this->hit('Atlas Compressors opens a Nairobi subsidiary to serve East African construction firms this quarter.');

        $this->assertSame('not_an_opportunity', $prefilter->rejection($event, $this->fleetProfile()));
        $this->assertNull($prefilter->rejection($event, $this->fleetProfile(), requireTopicCue: false));

        $job = $this->hit('Atlas Compressors is now hiring a country manager for its new Nairobi subsidiary, apply now.');
        $this->assertSame('not_an_opportunity', $prefilter->rejection($job, $this->fleetProfile(), requireTopicCue: false));
    }

    public function test_reddit_posts_are_hydrated_concurrently(): void
    {
        Http::fake([
            'www.reddit.com/r/logistics/comments/aaa/*' => Http::response($this->redditJson('Need fleet tracking', 'Our drivers keep faking fuel receipts. What do you all use?', 'ada'), 200),
            'www.reddit.com/r/logistics/comments/bbb/*' => Http::response([], 403),
        ]);

        $hydrated = (new RedditPostHydrator)->hydrateMany([
            3 => $this->hit('snippet one', 'https://www.reddit.com/r/logistics/comments/aaa/need_fleet_tracking/', null, false),
            7 => $this->hit('snippet two', 'https://www.reddit.com/r/logistics/comments/bbb/other/', null, false),
        ]);

        $this->assertTrue($hydrated[3]->fullText);
        $this->assertNotNull($hydrated[3]->postedAt);
        $this->assertSame('u/ada', $hydrated[3]->authorName);
        $this->assertSame('snippet two', $hydrated[7]->postText);
    }

    public function test_run_uses_the_plan_keeps_a_pain_point_and_drops_a_vendor(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm-key',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        $pain = 'Our drivers keep faking fuel receipts and I have no way to check where the trucks actually went. What are other Lagos fleet owners doing?';
        $vendorPost = 'Fleet owners in Lagos keep asking me how to stop fuel fraud. We built a GPS tracker that solves it, message me to see it working.';

        Http::fake(function (Request $request) use ($pain, $vendorPost) {
            $url = $request->url();
            $body = $request->body();

            if (str_contains($url, 'api.z.ai')) {
                if (str_contains($body, 'You plan a social-listening scan')) {
                    return Http::response($this->completion([
                        'mode' => 'sell',
                        'offer' => 'fleet tracking',
                        'synonyms' => ['GPS tracker', 'vehicle tracking'],
                        'pain_phrases' => ['drivers keep faking fuel receipts'],
                        'competitors' => ['Samsara'],
                        'communities' => ['logistics'],
                        'exclude_terms' => [],
                        'buyer' => 'A fleet owner or logistics manager with trucks on the road.',
                        'include_hiring' => false,
                    ]));
                }

                $isVendor = str_contains($body, 'We built a GPS tracker');

                return Http::response($this->completion([
                    'author_role' => $isVendor ? 'vendor' : 'buyer',
                    'opportunity_kind' => $isVendor ? 'none' : 'pain_point',
                    'signal_type' => 'recommendation',
                    'buying_intent_score' => 84,
                    'summary' => 'Fleet owner losing money to fuel receipt fraud.',
                    'evidence_quote' => $isVendor
                        ? 'We built a GPS tracker that solves it, message me to see it working.'
                        : 'Our drivers keep faking fuel receipts and I have no way to check where the trucks actually went.',
                    'actionability' => 'reply_now',
                    'company_name' => 'Individual',
                    'profile_name' => 'Ada',
                ]));
            }

            if (str_contains($url, 'www.reddit.com/r/logistics/comments/pain1')) {
                return Http::response($this->redditJson('Fuel receipts', $pain, 'ada'), 200);
            }

            if (str_contains($url, 'google.serper.dev')) {
                $q = (string) ($request->data()['q'] ?? '');
                if (str_contains($q, 'drivers keep faking fuel receipts') && str_contains($q, 'site:reddit.com')) {
                    return Http::response(['organic' => [
                        // No date: hydration must recover it.
                        ['title' => 'Fuel receipts', 'link' => 'https://www.reddit.com/r/logistics/comments/pain1/fuel_receipts/', 'snippet' => 'Our drivers keep faking fuel receipts and I have no way to check where...'],
                        ['title' => 'Stop fuel fraud', 'link' => 'https://www.reddit.com/r/logistics/comments/vend1/stop/', 'snippet' => $vendorPost, 'date' => '2 days ago'],
                    ]], 200);
                }

                return Http::response(['organic' => []], 200);
            }

            return Http::response([], 404);
        });

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Fleet',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'We sell GPS fleet tracking to logistics companies with truck fleets',
                'signalTypePacks' => [SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['reddit'], 'min_score' => 40, 'intent_filters' => []],
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings);

        $this->assertSame('completed', $run->status, (string) $run->error);
        $this->assertSame(1, $run->signals_created);

        $signal = SocialSignal::query()->where('organization_id', $org->id)->sole();
        $this->assertSame('https://www.reddit.com/r/logistics/comments/pain1/fuel_receipts/', $signal->post_url);
        $this->assertSame('Pain Point', $signal->intent_label);
        $this->assertSame('recommendation', $signal->signal_type);
        $this->assertNotNull($signal->posted_at);
        $this->assertSame('buyer', $signal->meta['author_role']);
        $this->assertSame('pain', $signal->meta['query_family']);

        $summary = $run->result_summary;
        $this->assertSame(['drivers keep faking fuel receipts'], $summary['listeningProfile']['pain_phrases']);
        $this->assertSame(1, $summary['rejectedDetail']['not_a_buyer'] ?? 0);
        $this->assertNotEmpty($summary['queries']);
        $this->assertContains('community', array_column($summary['queries'], 'family'));
    }

    public function test_rotation_starts_the_next_run_on_unused_queries(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.social_listening.daily_api_cap' => 500,
            'services.social_listening.max_search_calls_per_run' => 2,
        ]);
        Http::fake(['google.serper.dev/*' => Http::response(['organic' => []], 200)]);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Payroll',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'We sell payroll software to small teams',
                'searchKeywords' => ['payroll app', 'salary software'],
                'signalTypePacks' => [SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public']],
        ));

        Cache::forget("social_listening:rotation:{$icp->id}");
        $first = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings);
        $second = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings->fresh());

        $firstQueries = array_column($first->result_summary['queries'], 'query');
        $secondQueries = array_column($second->result_summary['queries'], 'query');

        $this->assertCount(2, $firstQueries);
        $this->assertCount(2, $secondQueries);
        $this->assertSame([], array_intersect($firstQueries, $secondQueries));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function completion(array $payload): array
    {
        return ['choices' => [['message' => ['content' => json_encode($payload)]]]];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function redditJson(string $title, string $body, string $author): array
    {
        return [[
            'data' => ['children' => [[
                'data' => [
                    'title' => $title,
                    'selftext' => $body,
                    'created_utc' => now()->subDays(2)->timestamp,
                    'author' => $author,
                ],
            ]]],
        ]];
    }

    private function hit(
        string $text,
        string $url = 'https://www.reddit.com/r/logistics/comments/abc/post/',
        ?Carbon $postedAt = null,
        bool $fullText = true,
    ): RawSocialHit {
        return new RawSocialHit(
            platform: 'reddit',
            sourceLabel: 'Reddit Post',
            sourceIcon: 'r',
            postText: $text,
            postUrl: $url,
            snippet: $text,
            title: 'Post',
            postedAt: $postedAt ?? ($fullText ? Carbon::now()->subDay() : null),
            fullText: $fullText,
        );
    }

    public function test_icp_exclusions_reach_the_qualifier_not_the_text_filter(): void
    {
        $brief = new IcpBrief(
            name: 'Fleet',
            description: '',
            industries: [],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: 'We sell GPS fleet tracking to haulage companies',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            exclusions: ['freight brokers'],
        );
        $profile = ListeningProfile::fromBrief($brief);

        $this->assertSame(['freight brokers'], $profile->avoid);
        $this->assertSame([], $profile->excludeTerms);

        // A buyer complaining about brokers is still a lead.
        $hit = $this->hit('We are done with freight brokers and want our own fleet tracking setup for 30 trucks, where do we start?');
        $this->assertTrue((new OpportunityPrefilter)->accepts($hit, $profile));
    }
}
