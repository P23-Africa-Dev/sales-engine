<?php

namespace Tests\Unit\Chat;

use App\Services\Chat\ChatListNumbering;
use App\Services\Chat\ValueSeekingQueryDetector;
use Tests\TestCase;

class ChatListNumberingTest extends TestCase
{
    public function test_renumbers_repeated_ones(): void
    {
        $input = "Here are ideas:\n1. Alpha\n1. Beta\n1. Gamma";
        $out = (new ChatListNumbering)->normalize($input);

        $this->assertStringContainsString('1. Alpha', $out);
        $this->assertStringContainsString('2. Beta', $out);
        $this->assertStringContainsString('3. Gamma', $out);
        $this->assertStringNotContainsString("1. Beta", $out);
    }

    public function test_preserves_sequence_across_blank_lines(): void
    {
        $input = "1. First\n\n1. Second\n\n1. Third";
        $out = (new ChatListNumbering)->normalize($input);

        $this->assertSame("1. First\n\n2. Second\n\n3. Third", $out);
    }

    public function test_resets_after_prose(): void
    {
        $input = "1. A\n1. B\n\nBased on your active ICP\n1. X\n1. Y";
        $out = (new ChatListNumbering)->normalize($input);

        $this->assertStringContainsString("1. A\n2. B", $out);
        $this->assertStringContainsString("1. X\n2. Y", $out);
    }
}

class ValueSeekingQueryDetectorTest extends TestCase
{
    public function test_detects_opportunity_prompts(): void
    {
        $detector = new ValueSeekingQueryDetector;

        $this->assertTrue($detector->matches('What opportunities are out there for me?'));
        $this->assertTrue($detector->matches('Show me market trends in my sector'));
        $this->assertTrue($detector->matches('Any hot deals I can take advantage of?'));
        $this->assertTrue($detector->matches('Use my ICP to find timely plays'));
    }

    public function test_skips_greetings_and_unrelated_short_chat(): void
    {
        $detector = new ValueSeekingQueryDetector;

        $this->assertFalse($detector->matches('hello'));
        $this->assertFalse($detector->matches('thanks'));
        $this->assertFalse($detector->matches('hi!'));
        $this->assertFalse($detector->matches('What is an ICP?'));
    }
}
