<?php

namespace Tests\Unit\Chat;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Chat\ChatService;
use Tests\TestCase;

class GroundedLeadNarrationTest extends TestCase
{
    public function test_narration_lists_only_structured_leads_and_matches_count(): void
    {
        $service = app(ChatService::class);
        $method = new \ReflectionMethod($service, 'narrateDiscovery');
        $method->setAccessible(true);

        $org = new Organization(['name' => 'Test Org']);
        $icp = new IcpProfile(['name' => 'My Tech ICP']);

        $leads = [
            [
                'name' => 'Lekan Adewoye',
                'title' => 'Managing Director/CEO',
                'company' => 'Suntrail Group Ltd',
                'summary' => 'Experienced fintech operator in Nigeria.',
                'icp_relevance_reason' => 'Matches Fintech focus and decision-maker titles.',
                'icp_recommended' => true,
                'score' => 92,
            ],
            [
                'name' => 'Aneesh Bond',
                'title' => 'Managing Director / CEO',
                'company' => 'AJO MOBILE APP',
                'summary' => 'Leader in marketing and digital practice.',
                'icp_recommended' => true,
                'score' => 90,
            ],
        ];

        $body = $method->invoke(
            $service,
            $org,
            $icp,
            'Find leads related to Ajo App',
            $leads,
            'generate_leads',
            null,
            [
                ['role' => 'user', 'content' => 'Tell me more about scaling Ajo'],
                ['role' => 'assistant', 'content' => 'Here are 20 imaginary Interswitch executives...'],
            ],
        );

        $this->assertStringContainsString('Found 2 leads for your search.', $body);
        $this->assertStringContainsString('1. Lekan Adewoye, Managing Director/CEO at Suntrail Group Ltd', $body);
        $this->assertStringContainsString('2. Aneesh Bond, Managing Director / CEO at AJO MOBILE APP', $body);
        $this->assertStringContainsString('All 2 score strongly against your ICP "My Tech ICP".', $body);
        $this->assertStringNotContainsString('Interswitch', $body);
        $this->assertStringNotContainsString('Olusegun', $body);
        $this->assertStringNotContainsString('Flutterwave', $body);
    }

    public function test_zero_leads_returns_clear_empty_message(): void
    {
        $service = app(ChatService::class);
        $method = new \ReflectionMethod($service, 'narrateDiscovery');
        $method->setAccessible(true);

        $body = $method->invoke(
            $service,
            new Organization(['name' => 'Test Org']),
            new IcpProfile(['name' => 'My Tech ICP']),
            'Find fintech founders',
            [],
            'generate_leads',
        );

        $this->assertStringContainsString('No leads could be extracted', $body);
    }
}
