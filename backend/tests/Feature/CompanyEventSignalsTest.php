<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Intent\SocialListeningOrchestrator;
use Database\Seeders\SignalTypeDefinitionSeeder;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The product overview's core path: a company event found in the news, verified, checked
 * against the ICP using the company's own public profile, and kept only when it qualifies.
 */
class CompanyEventSignalsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.glm.api_key' => 'test-glm-key',
            'services.serper.api_key' => 'test-serper-key',
            'services.social_listening.max_signal_type_queries_per_run' => 1,
        ]);
        Cache::flush();
        $this->seed(SignalTypeDefinitionSeeder::class);
    }

    /**
     * @return array{0: mixed, 1: mixed, 2: SocialListeningSetting}
     */
    private function manufacturingIcp(): array
    {
        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Manufacturers expanding into Africa',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Industrial Manufacturing'],
                'companySizes' => ['51-200', '201-500'],
                'territories' => ['Africa'],
                'decisionMakers' => ['Head of Sales', 'Export Director'],
                'signalTypePacks' => [SignalTypeDefinition::PACK_DEFAULT],
                'customPrompt' => 'Industrial manufacturers expanding into Africa that need local distribution',
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 30, 'intent_filters' => []],
        ));

        return [$user, $org, $icp, $settings];
    }

    private function fakeWorld(string $employeeRange, string $company = 'Atlas Maschinenbau', bool $matched = true, string $eventDate = ''): void
    {
        $glm = fn (array $json) => Http::response(['choices' => [['message' => ['content' => json_encode($json)]]]], 200);

        Http::fake([
            'api.z.ai/*' => function (Request $request) use ($glm, $company, $matched, $eventDate) {
                $body = $request->body();
                if (str_contains($body, 'Decide whether a post is a genuine match')) {
                    return $glm([
                        'matched' => $matched,
                        'reject_reason' => $matched ? '' : 'performance_story',
                        'company' => $company,
                        'description' => $company.' opened a Kenyan subsidiary for local distribution.',
                        'source_url' => '',
                        'source_date' => '',
                        'territory' => 'Kenya',
                        'event_date' => $eventDate,
                    ]);
                }
                if (str_contains($body, 'You qualify one public social post')) {
                    return $glm([
                        'author_role' => 'news',
                        'signal_type' => 'market_signal',
                        'buying_intent_score' => 80,
                        'actionability' => 'not_an_opportunity',
                        'summary' => $company.' opened a Kenyan subsidiary.',
                    ]);
                }

                return $glm(['mode' => 'sell', 'offer' => 'distribution services']);
            },
            'google.serper.dev/news' => Http::response(['news' => [[
                'title' => $company.' opens Kenyan subsidiary to distribute machinery across East Africa',
                'snippet' => $company.' has registered a subsidiary in Nairobi and appointed a country manager.',
                'link' => 'https://www.example-news.com/atlas-kenya',
                'date' => '2 days ago',
                'source' => 'Example Business News',
            ]]], 200),
            'google.serper.dev/search' => function (Request $request) use ($company, $employeeRange) {
                if (str_contains((string) $request['q'], 'company size employees')) {
                    return Http::response(['organic' => [[
                        'title' => $company.' GmbH | LinkedIn',
                        'link' => 'https://de.linkedin.com/company/atlas-maschinenbau',
                        'snippet' => 'Industry: Industrial Machinery Manufacturing · Company size: '.$employeeRange.' employees · Headquarters: Stuttgart, Baden-Württemberg',
                    ]]], 200);
                }

                return Http::response(['organic' => []], 200);
            },
            '*' => Http::response('', 404),
        ]);
    }

    public function test_news_event_from_a_qualifying_company_becomes_a_qualified_signal(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('201-500');

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame('completed', $run->status);
        $signal = SocialSignal::query()->where('organization_id', $org->id)->firstOrFail();
        $this->assertSame('news', $signal->platform);
        $this->assertSame('Atlas Maschinenbau', $signal->company_name);
        $this->assertSame('https://www.example-news.com/atlas-kenya', $signal->post_url);
        $this->assertNotNull($signal->posted_at);
        $this->assertSame('qualified', $signal->meta['icp_status']);
        $this->assertTrue($signal->meta['opportunity']);
        $this->assertSame(['industry' => 'verified', 'company_size' => 'verified', 'territory' => 'verified'], $signal->meta['icp_dimensions']);
        $this->assertSame('Stuttgart, Baden-Württemberg', $signal->meta['firmographics']['headquarters']);
    }

    public function test_company_that_contradicts_the_icp_is_not_qualified(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('5,001-10,000');

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->count());
        $this->assertSame(1, $run->result_summary['rejected']['icpMismatch']);
        $this->assertSame(1, $run->result_summary['rejectedDetail']['icp_company_size']);
    }

    public function test_event_without_a_named_company_is_rejected(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('201-500', company: '');

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->count());
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejectedDetail']['no_company'] ?? 0);
    }

    public function test_buyer_intent_queries_are_never_sent_to_the_news_source(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $icp->update(['config' => array_merge($icp->config, ['signalTypePacks' => [SignalTypeDefinition::PACK_NONE]])]);
        $this->fakeWorld('201-500');

        app(SocialListeningOrchestrator::class)->run($org, $icp->fresh(), $settings, $user);

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'serper.dev/news'));
    }

    public function test_news_story_that_is_not_the_searched_event_is_rejected(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('201-500', matched: false);

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->where('platform', 'news')->count());
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejected']['typeMismatch']);
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejectedDetail']['type_performance_story']);
    }

    public function test_the_same_company_event_from_several_outlets_is_one_opportunity(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        // Registered first so it wins over fakeWorld's single-story news stub.
        $story = fn (string $url) => ['title' => 'Atlas Maschinenbau opens Kenyan subsidiary', 'snippet' => 'Atlas Maschinenbau has registered a subsidiary in Nairobi to distribute machinery.', 'link' => $url, 'date' => '2 days ago', 'source' => 'Outlet'];
        Http::fake(['google.serper.dev/news' => Http::response(['news' => [$story('https://a.example/atlas'), $story('https://b.example/atlas')]], 200)]);
        $this->fakeWorld('201-500');

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame(1, SocialSignal::query()->where('organization_id', $org->id)->where('company_name', 'Atlas Maschinenbau')->count());
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejected']['duplicate']);
    }

    public function test_a_recent_post_about_an_old_event_is_rejected(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('201-500', eventDate: '2022-03-01');

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->where('platform', 'news')->count());
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejectedDetail']['type_event_outside_window'] ?? 0);
    }

    public function test_market_entry_news_is_searched_over_its_own_180_day_window(): void
    {
        [$user, $org, $icp, $settings] = $this->manufacturingIcp();
        $this->fakeWorld('201-500');

        app(SocialListeningOrchestrator::class)->run($org, $icp, $settings, $user);

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'serper.dev/news')
            && str_starts_with((string) $request['tbs'], 'cdr:1,cd_min:'.now()->subDays(180)->format('n/j/Y')));
    }
}
