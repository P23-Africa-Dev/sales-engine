<?php

namespace Tests\Unit\Support;

use App\Http\Controllers\Api\V1\DiscoveryController;
use App\Services\Intent\SocialListeningRunService;
use App\Support\UserFacingError;
use InvalidArgumentException;
use RuntimeException;
use Tests\TestCase;

class DeveloperInfoStaysServerSideTest extends TestCase
{
    public function test_raw_system_errors_become_a_plain_message(): void
    {
        $message = UserFacingError::from(new RuntimeException('SQLSTATE[HY000]: Serper 400 Not enough credits'));

        $this->assertSame(UserFacingError::GENERIC, $message);
        $this->assertStringNotContainsString('Serper', $message);
    }

    public function test_messages_written_for_users_pass_through(): void
    {
        $this->assertSame(
            'An active ICP profile is required for this intent.',
            UserFacingError::from(new InvalidArgumentException('An active ICP profile is required for this intent.')),
        );
    }

    public function test_stored_timeouts_keep_their_meaning_for_the_poller(): void
    {
        $this->assertSame(UserFacingError::TIMEOUT, UserFacingError::fromStored('Job timed out after 300 seconds (MaxAttemptsExceededException)'));
        $this->assertStringContainsString('taking longer', UserFacingError::TIMEOUT);
        $this->assertNull(UserFacingError::fromStored(null));
    }

    public function test_scan_summary_sent_to_the_browser_has_no_diagnostics(): void
    {
        $public = SocialListeningRunService::publicSummary([
            'totalChecked' => 100,
            'qualified' => 0,
            'rejected' => ['missingSourceDate' => 42, 'total' => 100],
            'rejectedDetail' => ['over_enrich_cap' => 20],
            'sources' => [['key' => 'reddit_native', 'status' => 'missing_key']],
            'enrichment' => ['found' => 0],
        ]);

        $this->assertSame(['totalChecked' => 100, 'qualified' => 0, 'enrichment' => ['found' => 0]], $public);
    }

    public function test_discovery_summary_sent_to_the_browser_has_no_diagnostics(): void
    {
        $public = DiscoveryController::publicSummary([
            'lead_count' => 8,
            'partial_leads' => [],
            'queries_executed' => ['secret query'],
            'provider_failures' => ['serper' => ['reason' => 'credits']],
            'gate_stats' => ['dropped_hard_gate' => 3],
        ]);

        $this->assertSame(['lead_count' => 8, 'partial_leads' => []], $public);
    }
}
