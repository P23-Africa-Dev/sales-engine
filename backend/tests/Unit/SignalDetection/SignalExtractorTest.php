<?php

namespace Tests\Unit\SignalDetection;

use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\SignalDetection\SignalExtractor;
use Carbon\Carbon;
use Tests\TestCase;

class SignalExtractorTest extends TestCase
{
    public function test_keeps_valid_new_market_entry_and_rejects_performance_story(): void
    {
        config(['services.glm.api_key' => '']);
        $type = $this->type('new_market_entry', 'New Market Entry', 'opening an office or subsidiary');
        $extractor = new SignalExtractor;
        $org = new Organization(['id' => 1]);

        $valid = $extractor->extract($this->hit(
            'Company X registers Kenyan subsidiary to begin local distribution',
            'Company X registers a Kenyan subsidiary',
        ), $type, $org);
        $this->assertTrue($valid->matched);

        $invalid = $extractor->extract($this->hit(
            "Company X's Q3 profits rose 12% partly due to African markets",
            'Q3 profits rose',
        ), $type, $org);
        $this->assertFalse($invalid->matched);
    }

    public function test_rejects_leadership_job_posting_without_a_hire(): void
    {
        config(['services.glm.api_key' => '']);
        $type = $this->type(
            'leadership_hire_in_territory',
            'Leadership Hire in Territory',
            'A named individual is hired as country manager',
            true,
        );
        $extractor = new SignalExtractor;
        $org = new Organization(['id' => 1]);

        $valid = $extractor->extract($this->hit(
            'Jane Doe appointed Country Manager for Kenya at Company X',
            'Jane Doe appointed',
        ), $type, $org);
        $this->assertTrue($valid->matched);
        $this->assertContains('Jane Doe', $valid->namedPeople);

        $invalid = $extractor->extract($this->hit(
            "We're hiring a Country Manager. Job posting apply now.",
            'Job opening',
        ), $type, $org);
        $this->assertFalse($invalid->matched);
    }

    public function test_rejects_engineering_listicle(): void
    {
        config(['services.glm.api_key' => '']);
        $type = $this->type('engineering_team_disruption', 'Engineering Team Disruption', 'layoffs affecting the engineering team');
        $extractor = new SignalExtractor;
        $org = new Organization(['id' => 1]);

        $valid = $extractor->extract($this->hit(
            'Company X lays off internal engineering team, cites cost-cutting',
            'Company X lays off',
        ), $type, $org);
        $this->assertTrue($valid->matched);

        $invalid = $extractor->extract($this->hit(
            'Top layoffs of 2026: a listicle of industry cuts',
            'Top layoffs of 2026',
        ), $type, $org);
        $this->assertFalse($invalid->matched);
    }

    public function test_open_developer_role_requires_sixty_days_on_the_watch_table(): void
    {
        config(['services.glm.api_key' => '']);
        [, $org] = $this->actingAsOrgMember();
        $type = $this->type('open_developer_roles_unfilled', 'Open Developer Roles Left Unfilled', 'job posting live 60+ days');
        $extractor = new SignalExtractor;
        $hit = $this->hit(
            'Hiring a senior developer / engineer. Job posting still open.',
            'Senior developer role',
        );

        $fresh = $extractor->extract($hit, $type, $org);
        $this->assertFalse($fresh->matched);
        $this->assertSame('job_posting_too_recent', $fresh->rejectReason);
        $this->assertDatabaseCount('job_posting_watches', 1);

        \App\Models\JobPostingWatch::query()->update([
            'first_seen_at' => now()->subDays(61),
        ]);

        $stale = $extractor->extract($hit, $type, $org);
        $this->assertTrue($stale->matched);
    }

    public function test_export_into_unrelated_market_is_rejected(): void
    {
        config(['services.glm.api_key' => '']);
        $type = $this->type('export_trade_activity_mention', 'Export/Trade Activity Mention', 'starting export activity');
        $extractor = new SignalExtractor;
        $org = new Organization(['id' => 1]);
        $brief = new \App\Services\Discovery\DTO\IcpBrief(
            name: 'Africa ICP',
            description: '',
            industries: [],
            territories: ['Kenya', 'Africa'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
        );

        $intoAfrica = $extractor->extract($this->hit(
            'Company X is exporting into Kenya this quarter',
            'Exporting into Kenya',
        ), $type, $org, $brief);
        $this->assertTrue($intoAfrica->matched);

        $intoIndia = $extractor->extract($this->hit(
            'Company X is exporting into India this quarter',
            'Exporting into India',
        ), $type, $org, $brief);
        $this->assertFalse($intoIndia->matched);
        $this->assertSame('export_direction_mismatch', $intoIndia->rejectReason);
    }

    public function test_extracts_size_and_revenue_from_the_post_not_the_icp(): void
    {
        config(['services.glm.api_key' => '']);
        $type = $this->type('new_market_entry', 'New Market Entry', 'opening an office or subsidiary');
        $extractor = new SignalExtractor;
        $org = new Organization(['id' => 1]);

        $detected = $extractor->extract($this->hit(
            'Company X registers Kenyan subsidiary to begin local distribution. 250 employees and $12 million in revenue.',
            'Company X registers a Kenyan subsidiary',
        ), $type, $org);

        $this->assertTrue($detected->matched);
        $this->assertSame('250 employees', $detected->companySize);
        $this->assertSame('$12 million', $detected->revenue);
        $this->assertSame('Kenya', $detected->territory);
    }

    private function type(string $key, string $label, string $trigger, bool $feeds = false): SignalTypeDefinition
    {
        return new SignalTypeDefinition([
            'key' => $key,
            'label' => $label,
            'trigger_description' => $trigger,
            'example_valid' => 'valid',
            'example_invalid' => 'invalid',
            'pack' => SignalTypeDefinition::PACK_DEFAULT,
            'feeds_enrichment' => $feeds,
            'default_recency_window_days' => 180,
            'active' => true,
        ]);
    }

    private function hit(string $text, string $title): RawSocialHit
    {
        return new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'in',
            postText: $text,
            postUrl: 'https://example.com/post',
            snippet: $text,
            title: $title,
            postedAt: Carbon::now()->subDay(),
        );
    }
}
