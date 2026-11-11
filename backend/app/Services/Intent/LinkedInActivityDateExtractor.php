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

        // X / Twitter status IDs are snowflakes too (Twitter epoch 2010-11-04).
        if (preg_match('#(?:x|twitter)\.com/[^/]+/status(?:es)?/(\d{15,20})#i', $url, $x)) {
            return $this->fromTweetId($x[1]);
        }

        if (
            ! preg_match('/activity[_-](\d{15,22})/i', $url, $m)
            && ! preg_match('/urn:li:(?:activity|ugcPost|share):(\d{15,22})/i', $url, $m)
            && ! preg_match('/(?:ugcPost|share)[_-](\d{15,22})/i', $url, $m)
            && ! preg_match('/\/posts\/[^\/]*-(\d{15,22})-/i', $url, $m)
        ) {
            return null;
        }

        return $this->fromActivityId($m[1]);
    }

    public function fromTweetId(string|int $tweetId): ?CarbonInterface
    {
        if (! is_numeric($tweetId) || (int) $tweetId <= 0) {
            return null;
        }

        $ms = ((int) $tweetId >> 22) + 1288834974657;
        $carbon = Carbon::createFromTimestampMs($ms);
        $now = now();

        return $carbon->greaterThan($now->copy()->addDay()) || $carbon->lessThan($now->copy()->subYears(8)) ? null : $carbon;
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
