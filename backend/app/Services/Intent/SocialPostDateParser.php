<?php

namespace App\Services\Intent;

use Carbon\Carbon;
use Carbon\CarbonInterface;

class SocialPostDateParser
{
    public function __construct(
        private readonly LinkedInActivityDateExtractor $linkedInIds = new LinkedInActivityDateExtractor,
    ) {}

    /**
     * Parse Serper organic `date` / snippet relative age / LinkedIn activity URL into a timestamp.
     */
    public function parse(
        ?string $dateRaw,
        ?string $snippet = null,
        ?CarbonInterface $now = null,
        ?string $postUrl = null,
    ): ?CarbonInterface {
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

        return $this->linkedInIds->fromUrl($postUrl);
    }

    private function parseOne(string $value, CarbonInterface $now): ?CarbonInterface
    {
        // Compact LinkedIn-style: "1yr", "2mo", "3w", "5d", "12h"
        if (preg_match('/^(\d+)\s*(yr|yrs|y|year|years|mo|mos|mth|mths|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours)\b/iu', $value, $m)) {
            return $this->subtractUnit((int) $m[1], $m[2], $now);
        }

        if (preg_match('/^yesterday\b/iu', $value)) {
            return $now->copy()->subDay()->startOfDay();
        }

        if (preg_match('/^today\b/iu', $value)) {
            return $now->copy()->startOfDay();
        }

        if (preg_match('/^(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s+ago\b/iu', $value, $m)) {
            return $this->subtractUnit((int) $m[1], $m[2], $now);
        }

        // Embedded relative: "... · 1yr · ...", "... 2 days ago · ..."
        if (preg_match('/\b(\d+)\s*(yr|yrs|y|year|years|mo|mos|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours)\b/iu', $value, $m)) {
            $unit = mb_strtolower($m[2]);
            // Avoid treating "200 million" style numbers as ages — require short unit forms or "ago"/separator context.
            if (preg_match('/\b'.$m[1].'\s*'.$m[2].'\b/iu', $value)
                && (
                    preg_match('/\b'.$m[1].'\s*(?:yr|yrs|y|mo|mos|w|wk|wks|d|h|hr|hrs)\b/iu', $value)
                    || preg_match('/\b'.$m[1].'\s*(?:year|years|month|months|week|weeks|day|days|hour|hours)\s+ago\b/iu', $value)
                    || preg_match('/[·•|]\s*'.$m[1].'\s*'.$m[2].'\b/iu', $value)
                )
            ) {
                return $this->subtractUnit((int) $m[1], $unit, $now);
            }
        }

        if (preg_match('/\b(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days|week|weeks|month|months|year|years)\s+ago\b/iu', $value, $m)) {
            return $this->subtractUnit((int) $m[1], $m[2], $now);
        }

        if (preg_match('/\byesterday\b/iu', $value)) {
            return $now->copy()->subDay()->startOfDay();
        }

        try {
            $carbon = Carbon::parse($value, $now->getTimezone());
            if ($carbon->greaterThan($now->copy()->addDay())) {
                return null;
            }
            if ($carbon->lessThan($now->copy()->subYears(8))) {
                return null;
            }

            return $carbon;
        } catch (\Throwable) {
            return null;
        }
    }

    private function subtractUnit(int $n, string $unit, CarbonInterface $now): ?CarbonInterface
    {
        if ($n < 1) {
            return null;
        }

        $unit = mb_strtolower(trim($unit));

        return match (true) {
            in_array($unit, ['min', 'mins', 'minute', 'minutes'], true) => $now->copy()->subMinutes($n),
            in_array($unit, ['h', 'hr', 'hrs', 'hour', 'hours'], true) => $now->copy()->subHours($n),
            in_array($unit, ['d', 'day', 'days'], true) => $now->copy()->subDays($n),
            in_array($unit, ['w', 'wk', 'wks', 'week', 'weeks'], true) => $now->copy()->subWeeks($n),
            in_array($unit, ['mo', 'mos', 'mth', 'mths', 'month', 'months'], true) => $now->copy()->subMonths($n),
            in_array($unit, ['y', 'yr', 'yrs', 'year', 'years'], true) => $now->copy()->subYears($n),
            default => null,
        };
    }
}
