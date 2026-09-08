<?php

namespace Tests\Unit\Intent;

use App\Services\Intent\SignalFreshnessScorer;
use App\Services\Intent\SocialPostDateParser;
use Carbon\Carbon;
use Tests\TestCase;

class SocialPostDateParserTest extends TestCase
{
    public function test_parses_relative_days_ago(): void
    {
        $now = Carbon::parse('2026-09-08 12:00:00');
        $parser = new SocialPostDateParser;

        $parsed = $parser->parse('3 days ago', null, $now);

        $this->assertNotNull($parsed);
        $this->assertSame('2026-09-05', $parsed->toDateString());
    }

    public function test_parses_iso_date(): void
    {
        $now = Carbon::parse('2026-09-08 12:00:00');
        $parser = new SocialPostDateParser;

        $parsed = $parser->parse('2026-09-07', null, $now);

        $this->assertNotNull($parsed);
        $this->assertSame('2026-09-07', $parsed->toDateString());
    }

    public function test_parses_relative_from_snippet(): void
    {
        $now = Carbon::parse('2026-09-08 12:00:00');
        $parser = new SocialPostDateParser;

        $parsed = $parser->parse(null, 'Looking for vendors · 2 days ago · Lagos', $now);

        $this->assertNotNull($parsed);
        $this->assertSame('2026-09-06', $parsed->toDateString());
    }

    public function test_returns_null_for_empty(): void
    {
        $this->assertNull((new SocialPostDateParser)->parse(null, null));
        $this->assertNull((new SocialPostDateParser)->parse('', ''));
    }

    public function test_parses_compact_year_and_linkedin_activity_url(): void
    {
        $now = Carbon::parse('2026-09-08 12:00:00');
        $parser = new SocialPostDateParser;

        $yr = $parser->parse('1yr', null, $now);
        $this->assertNotNull($yr);
        $this->assertSame('2025-09-08', $yr->toDateString());

        $url = 'https://www.linkedin.com/posts/bloom-public-health_lagos-free-zone-activity-7330955130554466307-Nacg';
        $fromUrl = $parser->parse(null, null, $now, $url);
        $this->assertNotNull($fromUrl);
        $this->assertSame('2025-05-21', $fromUrl->toDateString());
    }
}

class SignalFreshnessScorerTest extends TestCase
{
    public function test_serper_tbs_mapping(): void
    {
        $scorer = new SignalFreshnessScorer;

        $this->assertSame('qdr:d', $scorer->serperTbs(1));
        $this->assertSame('qdr:w', $scorer->serperTbs(7));
        $this->assertSame('qdr:m', $scorer->serperTbs(14));
        $this->assertSame('qdr:y', $scorer->serperTbs(90));
    }

    public function test_fresh_posts_get_boost_and_unknown_date_is_neutral(): void
    {
        $scorer = new SignalFreshnessScorer;
        $now = Carbon::parse('2026-09-08 12:00:00');

        $freshFactor = $scorer->factor($now->copy()->subHours(6), 14, $now);
        $unknown = $scorer->factor(null, 14, $now);
        $edge = $scorer->factor($now->copy()->subDays(14), 14, $now);

        $this->assertGreaterThan(1.0, $freshFactor);
        $this->assertSame(0.85, $unknown);
        $this->assertEqualsWithDelta(0.55, $edge, 0.01);
    }

    public function test_apply_multiplies_relevance(): void
    {
        $scorer = new SignalFreshnessScorer;
        $now = Carbon::parse('2026-09-08 12:00:00');

        $final = $scorer->apply(80.0, $now->copy()->subHours(6), 14, $now);

        $this->assertGreaterThan(80.0, $final);
        $this->assertLessThanOrEqual(95.0, $final);
    }

    public function test_is_stale_only_when_date_known_and_outside_window(): void
    {
        $scorer = new SignalFreshnessScorer;
        $now = Carbon::parse('2026-09-08 12:00:00');

        $this->assertFalse($scorer->isStale(null, 14, $now));
        $this->assertFalse($scorer->isStale($now->copy()->subDays(3), 14, $now));
        $this->assertTrue($scorer->isStale($now->copy()->subDays(20), 14, $now));
    }

    public function test_nudge_urgency_for_fresh_posts(): void
    {
        $scorer = new SignalFreshnessScorer;
        $now = Carbon::parse('2026-09-08 12:00:00');

        $this->assertSame('High', $scorer->nudgeUrgency('Medium', $now->copy()->subHours(12), $now));
        $this->assertSame('Medium', $scorer->nudgeUrgency('Medium', $now->copy()->subDays(5), $now));
        $this->assertSame('Medium', $scorer->nudgeUrgency('Medium', null, $now));
    }
}
