<?php

namespace App\Services\Intent;

use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * Decode LinkedIn activity snowflake IDs embedded in post URLs.
 * Example: .../activity-7330955130554466307-Nacg → ~2025-05-21
 */
class LinkedInActivityDateExtractor
{
    public function fromUrl(?string $url): ?CarbonInterface
    {
        if ($url === null || trim($url) === '') {
            return null;
        }

        if (
            ! preg_match('/activity[_-](\d{15,22})/i', $url, $m)
            && ! preg_match('/urn:li:activity:(\d{15,22})/i', $url, $m)
            && ! preg_match('/\/posts\/[^\/]*-(\d{15,22})-/i', $url, $m)
        ) {
            return null;
        }

        return $this->fromActivityId($m[1]);
    }

    public function fromActivityId(string|int $activityId): ?CarbonInterface
    {
        if (! is_numeric($activityId)) {
            return null;
        }

        try {
            // Keep as int on 64-bit PHP — do NOT cast through float (IDs exceed 2^53).
            $id = (int) $activityId;
            if ($id <= 0) {
                return null;
            }

            $ms = $id >> 22;
            if ($ms < 1_000_000_000_000) {
                return null;
            }

            $carbon = Carbon::createFromTimestampMs($ms);
            $now = now();
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
}
