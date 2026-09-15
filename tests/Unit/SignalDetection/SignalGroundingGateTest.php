<?php

namespace Tests\Unit\SignalDetection;

use App\Services\SignalDetection\SignalGroundingGate;
use Carbon\Carbon;
use Tests\TestCase;

class SignalGroundingGateTest extends TestCase
{
    public function test_rejects_missing_source_url(): void
    {
        $result = (new SignalGroundingGate)->admit(null, Carbon::now()->subDay(), 14);

        $this->assertFalse($result->admitted);
        $this->assertSame('missing_source_url', $result->reason);
    }

    public function test_rejects_blank_source_url(): void
    {
        $result = (new SignalGroundingGate)->admit('   ', Carbon::now()->subDay(), 14);

        $this->assertFalse($result->admitted);
        $this->assertSame('missing_source_url', $result->reason);
    }

    public function test_rejects_missing_source_date(): void
    {
        $result = (new SignalGroundingGate)->admit('https://example.com/post', null, 14);

        $this->assertFalse($result->admitted);
        $this->assertSame('missing_source_date', $result->reason);
    }

    public function test_rejects_stale_signal_outside_recency_window(): void
    {
        $now = Carbon::parse('2026-09-15 00:00:00');

        $result = (new SignalGroundingGate)->admit(
            'https://example.com/post',
            $now->copy()->subDays(20),
            14,
            $now,
        );

        $this->assertFalse($result->admitted);
        $this->assertSame('stale', $result->reason);
    }

    public function test_admits_a_recent_grounded_signal(): void
    {
        $now = Carbon::parse('2026-09-15 00:00:00');

        $result = (new SignalGroundingGate)->admit(
            'https://example.com/post',
            $now->copy()->subDays(2),
            14,
            $now,
        );

        $this->assertTrue($result->admitted);
        $this->assertNull($result->reason);
    }

    public function test_admits_a_signal_exactly_at_the_window_edge_but_not_past_it(): void
    {
        $now = Carbon::parse('2026-09-15 00:00:00');

        $atEdge = (new SignalGroundingGate)->admit(
            'https://example.com/post',
            $now->copy()->subDays(14),
            14,
            $now,
        );
        $pastEdge = (new SignalGroundingGate)->admit(
            'https://example.com/post',
            $now->copy()->subDays(15),
            14,
            $now,
        );

        $this->assertTrue($atEdge->admitted);
        $this->assertFalse($pastEdge->admitted);
    }
}
