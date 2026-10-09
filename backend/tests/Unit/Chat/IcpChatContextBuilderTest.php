<?php

namespace Tests\Unit\Chat;

use App\Models\IcpProfile;
use App\Services\Chat\IcpChatContextBuilder;
use Tests\TestCase;

class IcpChatContextBuilderTest extends TestCase
{
    public function test_to_prompt_payload_includes_full_active_icp_fields(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG Lagos',
            'description' => 'Distributors in Lagos',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'companySizes' => ['51-200'],
                'decisionMakers' => ['Head of Sales'],
                'customPrompt' => 'Prefer distributors with cold-chain.',
            ]),
        ]);

        $payload = app(IcpChatContextBuilder::class)->toPromptPayload($icp);

        $this->assertSame('FMCG Lagos', $payload['name']);
        $this->assertSame(['FMCG & Retail'], $payload['industries']);
        $this->assertSame(['Lagos, NG'], $payload['territories']);
        $this->assertSame(['Head of Sales'], $payload['decision_makers']);
        $this->assertStringContainsString('cold-chain', $payload['custom_prompt']);
    }

    public function test_freeform_system_prompt_embeds_icp_and_recommendation_rules(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Health Tech',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Health & Pharma'],
                'territories' => ['Nairobi, KE'],
            ]),
        ]);

        $prompt = app(IcpChatContextBuilder::class)->buildFreeformSystemPrompt($icp, 'Tommy');

        $this->assertStringContainsString('ACTIVE ICP', $prompt);
        $this->assertStringContainsString('Health & Pharma', $prompt);
        $this->assertStringContainsString('Nairobi, KE', $prompt);
        $this->assertStringContainsString('Based on your active ICP', $prompt);
        $this->assertStringContainsString('Tommy', $prompt);
        $this->assertStringContainsString('Do not ask the user to re-describe', $prompt);
        $this->assertStringNotContainsString('Active ICP: Health Tech.', $prompt);
    }

    public function test_freeform_system_prompt_without_icp_suggests_activating_one(): void
    {
        $prompt = app(IcpChatContextBuilder::class)->buildFreeformSystemPrompt(null);

        $this->assertStringContainsString('No active ICP', $prompt);
        $this->assertStringNotContainsString('Based on your active ICP', $prompt);
    }
}
