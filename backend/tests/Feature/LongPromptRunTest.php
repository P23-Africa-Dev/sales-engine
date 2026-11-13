<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Production incident (13 Nov 2026): a 330-character quick-research prompt failed with
 * "Data too long for column 'query'" because discovery_runs.query was varchar(255).
 */
class LongPromptRunTest extends TestCase
{
    public function test_the_run_query_column_holds_long_prompts(): void
    {
        // SQLite does not enforce varchar lengths, so check the column type itself.
        $this->assertSame('text', Schema::getColumnType('discovery_runs', 'query'));
    }

    public function test_signal_text_columns_hold_what_the_scan_saves(): void
    {
        // The scan clips these to 1,000 characters; varchar(255) failed every scan (13 Nov 2026).
        $this->assertSame('text', Schema::getColumnType('social_signals', 'intent_description'));
        $this->assertSame('text', Schema::getColumnType('social_signals', 'problem'));
    }
}
