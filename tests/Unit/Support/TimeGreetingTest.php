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
}
