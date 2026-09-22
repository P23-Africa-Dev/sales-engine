<?php

namespace Tests\Feature;

use Tests\TestCase;

class IcpSearchBriefSuggestTest extends TestCase
{
    public function test_suggest_endpoint_returns_heuristic_without_glm(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/icp-profiles/suggest-search-brief', [
                'mode' => 'generate',
                'industries' => ['Logistics & Fleet'],
                'territories' => ['Nigeria', 'Lagos, NG'],
                'decisionMakers' => ['Head of Sales'],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.source', 'heuristic');

        $brief = (string) $response->json('data.brief');
        $this->assertStringContainsString('3PL', $brief);
        $this->assertStringNotContainsStringIgnoringCase('nigeria', $brief);
        $this->assertStringNotContainsStringIgnoringCase('lagos', $brief);
        $this->assertNotEmpty($response->json('data.keywords'));
    }
}
