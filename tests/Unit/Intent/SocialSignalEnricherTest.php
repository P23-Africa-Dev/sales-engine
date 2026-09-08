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

    public function test_normalizes_new_opportunity_signal_types(): void
    {
        $enricher = app(SocialSignalEnricher::class);

        $this->assertSame('funding_event', $enricher->normalizeSignalType('funding_event'));
        $this->assertSame('investment_opportunity', $enricher->normalizeSignalType('investment'));
        $this->assertSame('partnership_opportunity', $enricher->normalizeSignalType('', '', 'We are exploring a partnership with a logistics firm.'));
        $this->assertSame(
            'funding_event',
            $enricher->normalizeSignalType('', '', 'Startup raises $10M in Series A funding round led by top VC.')
        );
        $this->assertSame(
            'market_signal',
            $enricher->normalizeSignalType('', '', 'Bloom invites pharma companies seeking to expand their footprint in West Africa.')
        );
        $this->assertSame(
            'hiring_expansion',
            $enricher->normalizeSignalType('', '', 'We are hiring a Head of Sales for our Lagos team.')
        );
    }

    public function test_heuristic_enrich_populates_personalization_fields(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Investor',
            'is_active' => true,
            'config' => array_merge(\App\Models\IcpProfile::defaultConfig(), [
                'customPrompt' => 'I want high-conviction tech investment opportunities outside my home market.',
            ]),
        ]);

        $hit = new RawSocialHit(
            platform: 'x',
            sourceLabel: 'X/Twitter Post',
            sourceIcon: 'x',
            postText: 'Excited to share we just closed our Series A funding round to expand into new markets.',
            postUrl: 'https://x.com/posts/example',
            snippet: 'Excited to share we just closed our Series A funding round.',
            title: 'Funding announcement',
        );

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertSame('funding_event', $enriched['signal_type']);
        $this->assertArrayHasKey('why_this_matters_to_you', $enriched);
        $this->assertNotSame('', $enriched['why_this_matters_to_you']);
        $this->assertArrayHasKey('benefits', $enriched);
        $this->assertArrayHasKey('personal_recommended_action_title', $enriched);
        $this->assertArrayHasKey('personal_recommended_action_detail', $enriched);
    }

    public function test_normalize_entity_type(): void
    {
        $enricher = app(SocialSignalEnricher::class);

        $this->assertSame('individual', $enricher->normalizeEntityType('', ''));
        $this->assertSame('individual', $enricher->normalizeEntityType('', 'Individual'));
        $this->assertSame('company', $enricher->normalizeEntityType('', 'Acme Inc'));
        $this->assertSame('company', $enricher->normalizeEntityType('company', ''));
    }
}
