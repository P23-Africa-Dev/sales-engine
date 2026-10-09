<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;
use DateTimeZone;

class TimeGreeting
{
    /** 12-hour clock with AM/PM, e.g. "10:16 PM". */
    public const CLOCK_FORMAT = 'g:i A';

    /** Full local datetime for prompts, e.g. "Tuesday, 22 Sep 2026 10:16 PM". */
    public const DATETIME_FORMAT = 'l, j M Y g:i A';

    /**
     * Morning: 05:00–11:59, Afternoon: 12:00–16:59, Evening: 17:00–21:59, else Hello.
     */
    public static function phrase(?string $timezone = null, ?DateTimeInterface $at = null): string
    {
        $moment = self::moment($timezone, $at);
        $hour = (int) $moment->format('G');

        return match (true) {
            $hour >= 5 && $hour < 12 => 'Good morning',
            $hour >= 12 && $hour < 17 => 'Good afternoon',
            $hour >= 17 && $hour < 22 => 'Good evening',
            default => 'Hello',
        };
    }

    /** Formatted local clock time in 12-hour AM/PM. */
    public static function clock(?string $timezone = null, ?DateTimeInterface $at = null): string
    {
        return self::moment($timezone, $at)->format(self::CLOCK_FORMAT);
    }

    /** Formatted local date + time in 12-hour AM/PM. */
    public static function localDateTime(?string $timezone = null, ?DateTimeInterface $at = null): string
    {
        return self::moment($timezone, $at)->format(self::DATETIME_FORMAT);
    }

    /** Instruction block injected into LLM system prompts. */
    public static function promptContext(?string $timezone = null, ?DateTimeInterface $at = null): string
    {
        $tz = self::resolveTimezone($timezone);
        $moment = self::moment($timezone, $at);
        $phrase = self::phrase($timezone, $moment);
        $clock = $moment->format(self::CLOCK_FORMAT);
        $dated = $moment->format(self::DATETIME_FORMAT);

        return sprintf(
            'Current user local time: %s (%s). Clock shows %s. '
                . 'When you mention the current time or date, always use exactly this local time (%s) and always write times in 12-hour AM/PM form (e.g. "10:16 PM") — never a 24-hour clock. '
                . 'Use "%s" (or "Hello") when greeting — never "Good morning" after 11:59, never "Good afternoon" before noon or after 17:00, never "Good evening" before 17:00.',
            $dated,
            $tz,
            $clock,
            $clock,
            $phrase,
        );
    }

    public static function resolveTimezone(?string $timezone): string
    {
        if ($timezone !== null && $timezone !== '' && in_array($timezone, DateTimeZone::listIdentifiers(), true)) {
            return $timezone;
        }

        return (string) config('app.user_timezone', 'Africa/Lagos');
    }

    private static function moment(?string $timezone, ?DateTimeInterface $at): Carbon
    {
        $tz = self::resolveTimezone($timezone);

        return $at
            ? Carbon::instance($at)->timezone($tz)
            : Carbon::now($tz);
    }
}
