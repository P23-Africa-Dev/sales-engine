<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\LinkedInActivityDateExtractor;
use App\Services\Intent\OpportunityGate;
use App\Services\Intent\OpportunityPrefilter;
use App\Services\SignalDetection\IcpOpportunityQueryBuilder;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The ICP is what the account is LOOKING FOR right now, never what it does.
 */
class IcpNeedListeningTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function needs(): array
    {
        return [
            'customers named by target' => ['fintech payment companies in Lagos', 'sell'],
            'needs a supplier' => ['reliable cocoa bean suppliers in Ghana', 'source'],
            'needs software' => ['we need a payroll software provider for our 200 staff', 'source'],
            'needs investors' => ['looking for investors for our agritech startup', 'raise'],
            'wants deals' => ['seed-stage fintech startups to invest in', 'invest'],
            'wants partners' => ['distribution partners for solar kits in Kenya', 'partner'],
        ];
    }

    #[DataProvider('needs')]
    public function test_mode_comes_from_what_the_account_needs(string $need, string $mode): void
    {
        $this->assertSame($mode, ListeningProfile::modeFromNeed(mb_strtolower($need)));
    }

    public function test_heuristic_profile_never_assumes_the_account_sells_its_icp(): void
    {
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'Cocoa',
            'config' => array_merge(IcpProfile::defaultConfig(), ['customPrompt' => 'reliable cocoa bean suppliers', 'territories' => ['Ghana']]),
        ]));

        $profile = ListeningProfile::fromBrief($brief);
        $queries = implode(' | ', app(IcpOpportunityQueryBuilder::class)->fromProfile($profile));

        $this->assertSame('source', $profile->mode);
        $this->assertStringContainsString('supplier', mb_strtolower($queries));
        $this->assertStringNotContainsString('alternative to', mb_strtolower($queries));
    }

    private function hit(string $text): RawSocialHit
    {
        return new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn Post',
            sourceIcon: 'in',
            postText: $text,
            postUrl: 'https://www.linkedin.com/posts/abc',
            snippet: $text,
            title: 'Post',
            postedAt: Carbon::now()->subDay(),
            fullText: true,
        );
    }

    public function test_a_supplier_offering_what_the_account_needs_is_an_opening(): void
    {
        $profile = new ListeningProfile('source', 'cocoa beans', [], false, ['Ghana'], target: 'cocoa suppliers');
        $text = 'We supply grade A cocoa beans in bulk from Kumasi, Ghana. Export-ready with full traceability, contact us for the current price list.';

        $this->assertTrue((new OpportunityPrefilter)->accepts($this->hit($text), $profile));
        $this->assertNull((new OpportunityGate)->rejection([
            'actionability' => 'reply_now',
            'author_role' => 'vendor',
            'signal_type' => 'market_signal',
            'evidence_quote' => 'We supply grade A cocoa beans in bulk from Kumasi, Ghana.',
        ], $text, $profile));
    }

    public function test_the_same_vendor_post_is_not_an_opening_when_the_account_needs_customers(): void
    {
        $profile = new ListeningProfile('sell', 'cocoa beans', [], false, ['Ghana']);
        $text = 'We supply grade A cocoa beans in bulk from Kumasi, Ghana. Export-ready with full traceability, contact us for the current price list.';

        $this->assertNotNull((new OpportunityGate)->rejection([
            'actionability' => 'reply_now',
            'author_role' => 'vendor',
            'signal_type' => 'market_signal',
            'evidence_quote' => 'We supply grade A cocoa beans in bulk from Kumasi, Ghana.',
        ], $text, $profile));
    }

    public function test_a_named_target_company_expanding_is_an_opening_for_a_customers_need(): void
    {
        $profile = new ListeningProfile('sell', 'fintech payment companies', [], false, ['Nigeria'], target: 'fintech companies in Lagos');
        $text = 'Big news: we are expanding our payments operations to Abuja and Port Harcourt next quarter, opening two new offices and onboarding new partners.';
        $queries = implode(' | ', app(IcpOpportunityQueryBuilder::class)->fromProfile($profile));

        $this->assertStringContainsString('expanding', $queries);
        $this->assertNull((new OpportunityGate)->rejection([
            'actionability' => 'reply_now',
            'author_role' => 'founder',
            'signal_type' => 'market_signal',
            'evidence_quote' => 'we are expanding our payments operations to Abuja and Port Harcourt next quarter',
        ], $text, $profile));
    }

    public function test_need_phrases_lead_the_plan_as_exact_phrases(): void
    {
        $profile = new ListeningProfile('source', 'cocoa beans', [], false, ['Ghana'], painPhrases: ['we supply bulk cocoa beans'], target: 'cocoa suppliers');

        $plan = app(IcpOpportunityQueryBuilder::class)->plan($profile);

        $this->assertSame('pain', $plan[0]['family']);
        $this->assertStringContainsString('"we supply bulk cocoa beans"', $plan[0]['query']);
    }

    public function test_post_dates_are_recovered_from_x_and_linkedin_ids(): void
    {
        $dates = app(LinkedInActivityDateExtractor::class);

        // Tweet 1862000000000000000 was posted in late Nov 2024.
        $tweet = $dates->fromUrl('https://x.com/someone/status/1862000000000000000');
        $this->assertNotNull($tweet);
        $this->assertSame('2024-11', $tweet->format('Y-m'));

        $this->assertNotNull($dates->fromUrl('https://www.linkedin.com/feed/update/urn:li:ugcPost:7330955130554466307/'));
    }
}
