<?php

namespace App\Services\Intent;

use Carbon\Carbon;
use Carbon\CarbonInterface;

class SocialPostDateParser
{
    /**
     * Parse Serper organic `date` / snippet relative age into a timestamp.
     */
    public function parse(?string $dateRaw, ?string $snippet = null, ?CarbonInterface $now = null): ?CarbonInterface
    {
        $now = $now ? Carbon::instance($now->toDateTime()) : now();

        foreach ([$dateRaw, $snippet] as $candidate) {
            if ($candidate === null || trim($candidate) === '') {
                continue;
            }

            $parsed = $this->parseOne(trim($candidate), $now);
            if ($parsed !== null) {
                return $parsed;
            }
        }

        return null;
    }

    private function parseOne(string $value, CarbonInterface $now): ?CarbonInterface
    {
        // Relative: "2 days ago", "3 hours ago", "1 week ago", "Yesterday"
        if (preg_match('/^yesterday\b/iu', $value)) {
            return $now->copy()->subDay()->startOfDay();
        }

        if (preg_match('/^today\b/iu', $value)) {
            return $now->copy()->startOfDay();
        }

        if (preg_match('/^(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months)\s+ago\b/iu', $value, $m)) {
            $n = (int) $m[1];
            $unit = mb_strtolower($m[2]);

            return match (true) {
                str_starts_with($unit, 'min') => $now->copy()->subMinutes($n),
                str_starts_with($unit, 'hour') || str_starts_with($unit, 'hr') => $now->copy()->subHours($n),
                str_starts_with($unit, 'day') => $now->copy()->subDays($n),
                str_starts_with($unit, 'week') => $now->copy()->subWeeks($n),
                str_starts_with($unit, 'month') => $now->copy()->subMonths($n),
                default => null,
            };
        }

        // Embedded relative in snippet: "... · 2 days ago · ..."
        if (preg_match('/\b(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days|week|weeks|month|months)\s+ago\b/iu', $value, $m)) {
            return $this->parseOne($m[0], $now);
        }

        if (preg_match('/\byesterday\b/iu', $value)) {
            return $now->copy()->subDay()->startOfDay();
        }

        try {
            $carbon = Carbon::parse($value, $now->getTimezone());
            // Reject absurd future/far-past parses from garbage strings
            if ($carbon->greaterThan($now->copy()->addDay())) {
                return null;
            }
            if ($carbon->lessThan($now->copy()->subYears(5))) {
                return null;
            }

            return $carbon;
        } catch (\Throwable) {
            return null;
        }
    }
}
