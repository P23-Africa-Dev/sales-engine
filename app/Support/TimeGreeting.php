<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;
use DateTimeZone;

class TimeGreeting
{
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

    /** Instruction block injected into LLM system prompts. */
    public static function promptContext(?string $timezone = null, ?DateTimeInterface $at = null): string
    {
        $tz = self::resolveTimezone($timezone);
        $moment = self::moment($timezone, $at);
        $phrase = self::phrase($timezone, $moment);

        return sprintf(
            'Current user local time: %s (%s). Use "%s" (or "Hello") when greeting — never "Good morning" after 11:59, never "Good afternoon" before noon or after 17:00, never "Good evening" before 17:00.',
            $moment->format('l, j M Y H:i'),
            $tz,
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
