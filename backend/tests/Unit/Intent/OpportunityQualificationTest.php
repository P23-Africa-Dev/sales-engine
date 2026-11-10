<?php

namespace Tests\Unit\Intent;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\OpportunityGate;
use App\Services\Intent\OpportunityPrefilter;
use App\Services\Intent\RedditPostHydrator;
use App\Services\SignalDetection\IcpOpportunityQueryBuilder;
use App\Services\SignalDetection\SignalGroundingGate;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OpportunityQualificationTest extends TestCase
{
    public function test_payroll_queries_ask_for_buyers_and_not_funding_or_hiring(): void
    {
        $queries = implode(' ', (new IcpOpportunityQueryBuilder)->build($this->brief(
            'We sell payroll software to small teams',
            [],
        )));
        $lower = mb_strtolower($queries);

        $this->assertStringContainsString('recommend', $lower);
        $this->assertStringContainsString('looking for', $lower);
        $this->assertStringContainsString('alternative', $lower);
        $this->assertStringContainsString('payroll', $lower);
        $this->assertStringNotContainsString('funding', $lower);
        $this->assertStringNotContainsString('appointed or hiring', $lower);
    }

    public function test_named_competitor_adds_a_switching_query(): void
    {
        $queries = implode(' ', (new IcpOpportunityQueryBuilder)->build($this->brief(
            'We sell payroll software. Teams are switching off QuickBooks.',
            [],
        )));

        $this->assertStringContainsString('QuickBooks', $queries);
        $this->assertStringContainsString('frustrated with', $queries);
    }

    #[DataProvider('posts')]
    public function test_only_concrete_openings_pass(
        string $mode,
        bool $includeHiring,
        string $text,
        bool $fullText,
        ?string $quote,
        string $signalType,
        bool $passes,
    ): void {
        $profile = new ListeningProfile($mode, 'payroll software', [], $includeHiring, []);
        $hit = new RawSocialHit(
            platform: 'reddit',
            sourceLabel: 'Reddit Post',
            sourceIcon: 'r',
            postText: $text,
            postUrl: 'https://www.reddit.com/r/smallbusiness/comments/abc/post/',
            snippet: $text,
            title: 'Post',
            postedAt: Carbon::now()->subDay(),
            fullText: $fullText,
        );

        $prefilterPasses = (new OpportunityPrefilter)->accepts($hit, $profile);
        $gatePasses = false;
        if ($quote !== null) {
            $gatePasses = (new OpportunityGate)->rejection([
                'actionability' => 'reply_now',
                'signal_type' => $signalType,
                'evidence_quote' => $quote,
            ], $text, $profile) === null;
        }

        if ($passes) {
            $this->assertTrue($prefilterPasses);
            $this->assertTrue($gatePasses);
        } else {
            $this->assertFalse($prefilterPasses && $gatePasses);
        }
    }

    /**
     * @return array<string, array{0: string, 1: bool, 2: string, 3: bool, 4: ?string, 5: string, 6: bool}>
     */
    public static function posts(): array
    {
        $ask = 'Anyone recommend a payroll tool for a 20-person team in Lagos? We need something we can switch to this quarter.';
        $switching = 'We are switching off QuickBooks and need to know what other teams are using for payroll this quarter.';
        $funding = 'Voltify just closed a Series A funding round led by top investors to expand into new markets this week.';
        $job = 'We are hiring a payroll manager for our Lagos office. Apply now with your resume and salary expectations today.';
        $listicle = 'The 10 best payroll tools for small teams in Lagos this year, ranked by price and support quality for buyers.';
        $thin = 'Looking for a payroll tool in Lagos?';
        $headline = 'Payroll weekly roundup vendors shipped updates across the region this month and analysts weighed in.';

        return [
            'recommendation ask' => ['sell', false, $ask, false, $ask, 'recommendation', true],
            'competitor switch' => ['sell', false, $switching, false, $switching, 'switching', true],
            'funding while selling' => ['sell', false, $funding, false, $funding, 'funding_event', false],
            'funding while investing' => ['invest', false, $funding, false, $funding, 'funding_event', true],
            'job ad' => ['sell', false, $job, false, $job, 'hiring_expansion', false],
            'listicle' => ['sell', false, $listicle, false, $listicle, 'recommendation', false],
            'thin snippet' => ['sell', false, $thin, false, $thin, 'recommendation', false],
            'quote the model invented' => ['sell', false, $ask, false, 'I made up a sentence about payroll that is not written in the post itself.', 'recommendation', false],
            'headline copied without an ask' => ['sell', false, $ask.' '.$headline, false, $headline, 'recommendation', false],
        ];
    }

    public function test_missing_and_stale_dates_are_rejected(): void
    {
        $gate = new SignalGroundingGate;
        $now = Carbon::parse('2026-06-15 12:00:00');

        $missing = $gate->admit('https://example.com/post', null, 30, $now, false);
        $this->assertFalse($missing->admitted);
        $this->assertSame('missing_source_date', $missing->reason);

        $stale = $gate->admit('https://example.com/post', $now->copy()->subDays(40), 30, $now, false);
        $this->assertFalse($stale->admitted);
        $this->assertSame('stale', $stale->reason);
    }

    public function test_reddit_json_replaces_a_thin_snippet(): void
    {
        Http::fake([
            'www.reddit.com/*' => Http::response([
                [
                    'data' => [
                        'children' => [[
                            'data' => [
                                'title' => 'Payroll help',
                                'selftext' => 'Anyone recommend a payroll tool for a 20-person team in Lagos this month?',
                                'created_utc' => now()->subDay()->timestamp,
                                'author' => 'ada',
                            ],
                        ]],
                    ],
                ],
            ], 200),
        ]);

        $hit = new RawSocialHit(
            platform: 'reddit',
            sourceLabel: 'Reddit Post',
            sourceIcon: 'r',
            postText: 'short snippet',
            postUrl: 'https://www.reddit.com/r/smallbusiness/comments/abc/payroll/',
            snippet: 'short snippet',
            title: 'Payroll help',
        );

        $hydrated = (new RedditPostHydrator)->hydrate($hit);

        $this->assertTrue($hydrated->fullText);
        $this->assertStringContainsString('Anyone recommend a payroll tool', $hydrated->postText);
        $this->assertNotNull($hydrated->postedAt);
        $this->assertSame('u/ada', $hydrated->authorName);
    }

    /**
     * @param  list<string>  $industries
     */
    private function brief(string $prompt, array $industries): IcpBrief
    {
        return new IcpBrief(
            name: 'Payroll',
            description: '',
            industries: $industries,
            territories: ['Lagos, NG'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: $prompt,
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );
    }
}
