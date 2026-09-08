<?php

namespace App\Services\Intent;

use Carbon\CarbonInterface;

/**
 * Blends ICP relevance with post recency so fresh opportunities rank above stale ones.
 */
class SignalFreshnessScorer
{
    public const UNKNOWN_DATE_FACTOR = 0.85;

    public const WINDOW_EDGE_FACTOR = 0.55;

    public const FRESH_BOOST_HOURS = 48;

    public const FRESH_BOOST_FACTOR = 1.05;

    /**
     * Map freshness_window_days to a Serper tbs value.
     */
    public function serperTbs(int $freshnessWindowDays): string
    {
        return match (true) {
            $freshnessWindowDays <= 1 => 'qdr:d',
            $freshnessWindowDays <= 7 => 'qdr:w',
            $freshnessWindowDays <= 31 => 'qdr:m',
            default => 'qdr:y',
        };
    }

    public function factor(?CarbonInterface $postedAt, int $windowDays, ?CarbonInterface $now = null): float
    {
        $now = $now ?? now();
        $windowDays = max(1, $windowDays);

        if ($postedAt === null) {
            return self::UNKNOWN_DATE_FACTOR;
        }

        $ageHours = max(0.0, ($now->getTimestamp() - $postedAt->getTimestamp()) / 3600.0);

        if ($ageHours <= self::FRESH_BOOST_HOURS) {
            // Linear from 1.05 at 0h to 1.0 at 48h
            $t = $ageHours / self::FRESH_BOOST_HOURS;

            return round(self::FRESH_BOOST_FACTOR - ($t * (self::FRESH_BOOST_FACTOR - 1.0)), 4);
        }

        $windowHours = $windowDays * 24.0;
        if ($ageHours >= $windowHours) {
            return self::WINDOW_EDGE_FACTOR;
        }

        // Linear decay from 1.0 at 48h to 0.55 at window edge
        $t = ($ageHours - self::FRESH_BOOST_HOURS) / max(1.0, $windowHours - self::FRESH_BOOST_HOURS);

        return round(1.0 - ($t * (1.0 - self::WINDOW_EDGE_FACTOR)), 4);
    }

    public function apply(float $relevanceScore, ?CarbonInterface $postedAt, int $windowDays, ?CarbonInterface $now = null): float
    {
        $factor = $this->factor($postedAt, $windowDays, $now);
        $final = $relevanceScore * $factor;

        return max(0, min(95, round($final, 1)));
    }

    public function isStale(?CarbonInterface $postedAt, int $windowDays, ?CarbonInterface $now = null): bool
    {
        if ($postedAt === null) {
            return false;
        }

        $now = $now ?? now();
        $windowDays = max(1, $windowDays);

        return $postedAt->lt($now->copy()->subDays($windowDays));
    }

    public function nudgeUrgency(?string $urgency, ?CarbonInterface $postedAt, ?CarbonInterface $now = null): ?string
    {
        if ($postedAt === null) {
            return $urgency;
        }

        $now = $now ?? now();
        $ageHours = max(0.0, ($now->getTimestamp() - $postedAt->getTimestamp()) / 3600.0);

        if ($ageHours > self::FRESH_BOOST_HOURS) {
            return $urgency;
        }

        $current = mb_strtolower(trim((string) $urgency));
        if (in_array($current, ['critical', 'high'], true)) {
            return $urgency !== null && $urgency !== '' ? $urgency : 'High';
        }

        return 'High';
    }
}
