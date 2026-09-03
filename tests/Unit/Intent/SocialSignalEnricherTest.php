<?php

namespace Tests\Unit\Intent;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialSignalEnricher;
use App\Services\Llm\GlmClient;
use Tests\TestCase;

class SocialSignalEnricherTest extends TestCase
{
    public function test_normalizes_freeform_glm_signal_types(): void
    {
        $enricher = app(SocialSignalEnricher::class);

        $this->assertSame('hiring_expansion', $enricher->normalizeSignalType('Job Post', 'Job Application'));
        $this->assertSame('switching', $enricher->normalizeSignalType('Vendor Change', 'Looking to switch CRM'));
        $this->assertSame('pricing', $enricher->normalizeSignalType('', '', 'What does this cost per month?'));
        $this->assertSame('recommendation', $enricher->normalizeSignalType('Content Engagement', '', 'Anyone recommend a logistics tool for Lagos FMCG?'));
    }

    public function test_heuristic_enrich_produces_score_above_threshold(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(\App\Models\IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'linkedin',
            postText: 'Looking for recommendations on FMCG distribution software in Lagos — currently switching from our old vendor.',
            postUrl: 'https://linkedin.com/posts/example',
            snippet: 'Looking for recommendations on FMCG distribution software in Lagos',
            title: 'FMCG distribution tools?',
        );

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertSame('switching', $enriched['signal_type']);
        $this->assertGreaterThanOrEqual(55, $enriched['score']);
    }
}
