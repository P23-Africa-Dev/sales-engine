<?php

namespace Tests\Unit\Support;

use App\Support\TimeGreeting;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TimeGreetingTest extends TestCase
{
    #[DataProvider('phraseProvider')]
    public function test_phrase_matches_hour(int $hour, string $expected): void
    {
        $at = Carbon::parse('2026-01-15')->setTime($hour, 0);

        $this->assertSame($expected, TimeGreeting::phrase('UTC', $at));
    }

    public static function phraseProvider(): array
    {
        return [
            'late night' => [2, 'Hello'],
            'early morning' => [5, 'Good morning'],
            'late morning' => [11, 'Good morning'],
            'noon' => [12, 'Good afternoon'],
            'mid afternoon' => [15, 'Good afternoon'],
            'evening' => [18, 'Good evening'],
            'late evening' => [21, 'Good evening'],
            'after 9pm' => [22, 'Hello'],
        ];
    }

    public function test_invalid_timezone_falls_back_to_config_default(): void
    {
        $at = Carbon::parse('2026-01-15 14:00', 'Africa/Lagos');

        $this->assertSame('Good afternoon', TimeGreeting::phrase('Not/A_Timezone', $at));
    }

    public function test_clock_and_prompt_use_12_hour_am_pm(): void
    {
        $at = Carbon::parse('2026-09-21 22:16:00', 'Africa/Lagos');

        $this->assertSame('10:16 PM', TimeGreeting::clock('Africa/Lagos', $at));
        $this->assertSame('Monday, 21 Sep 2026 10:16 PM', TimeGreeting::localDateTime('Africa/Lagos', $at));

        $context = TimeGreeting::promptContext('Africa/Lagos', $at);
        $this->assertStringContainsString('10:16 PM', $context);
        $this->assertStringContainsString('Africa/Lagos', $context);
        $this->assertStringContainsString('12-hour AM/PM', $context);
        $this->assertStringNotContainsString('22:16', $context);
        $this->assertStringContainsString('Hello', $context);
    }

    public function test_morning_clock_uses_am(): void
    {
        $at = Carbon::parse('2026-09-21 09:05:00', 'Africa/Lagos');

        $this->assertSame('9:05 AM', TimeGreeting::clock('Africa/Lagos', $at));
        $this->assertStringContainsString('9:05 AM', TimeGreeting::promptContext('Africa/Lagos', $at));
    }
}
