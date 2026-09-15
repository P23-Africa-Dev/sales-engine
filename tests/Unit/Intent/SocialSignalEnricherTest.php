<?php

namespace Tests\Unit\Intent;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialSignalEnricher;
use App\Services\Llm\GlmClient;
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function test_heuristic_enrich_does_not_copy_icp_firmographics_onto_the_hit(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(\App\Models\IcpProfile::defaultConfig(), [
                'industries' => ['ZzyxxUniqueIndustry'],
                'territories' => ['QqwertTerritory'],
                'decisionMakers' => ['UniqueDecisionMakerTitle'],
            ]),
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'linkedin',
            postText: 'Looking for recommendations on logistics software.',
            postUrl: 'https://linkedin.com/posts/example-no-icp',
            snippet: 'Looking for recommendations on logistics software.',
            title: 'Logistics tools?',
        );

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertSame('logistics', $enriched['industry']);
        $this->assertSame('', $enriched['location_text']);
        $this->assertNotSame('UniqueDecisionMakerTitle', $enriched['persona']);
        $this->assertStringNotContainsString('ZzyxxUniqueIndustry', json_encode($enriched));
        $this->assertStringNotContainsString('QqwertTerritory', json_encode($enriched));
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

    public function test_named_people_are_captured_when_a_leadership_hire_signal_type_is_passed(): void
    {
        config(['services.glm.api_key' => 'test-glm-key']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => \App\Models\IcpProfile::defaultConfig(),
        ]);

        $signalType = \App\Models\SignalTypeDefinition::query()->create([
            'organization_id' => null,
            'key' => 'leadership_hire_in_territory',
            'label' => 'Leadership Hire in Territory',
            'trigger_description' => 'A named individual is hired or appointed into a territory-specific role.',
            'pack' => 'default',
            'feeds_enrichment' => true,
            'default_recency_window_days' => 180,
            'active' => true,
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'in',
            postText: 'Jane Doe appointed Country Manager for Kenya, replacing John Smith.',
            postUrl: 'https://linkedin.com/posts/jane-doe',
            snippet: 'Jane Doe appointed Country Manager for Kenya.',
            title: 'Jane Doe on LinkedIn',
        );

        \Illuminate\Support\Facades\Http::fake([
            'open.bigmodel.cn/*' => \Illuminate\Support\Facades\Http::response([
                'choices' => [[
                    'message' => ['content' => json_encode([
                        'profile_name' => 'Jane Doe',
                        'company_name' => 'Acme Corp',
                        'entity_type' => 'company',
                        'signal_type' => 'hiring_expansion',
                        'named_people' => ['Jane Doe', 'John Smith'],
                        'summary' => 'Jane Doe appointed Country Manager for Kenya.',
                    ])],
                ]],
            ], 200),
        ]);

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit, $signalType);

        $this->assertSame(['Jane Doe', 'John Smith'], $enriched['named_people']);

        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            $body = $request->body();

            return str_contains($body, 'Leadership Hire in Territory')
                && str_contains($body, 'expected to name a real person');
        });
    }

    public function test_named_people_defaults_to_empty_array_without_a_signal_type(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => \App\Models\IcpProfile::defaultConfig(),
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'in',
            postText: 'Looking for a CRM recommendation.',
            postUrl: 'https://linkedin.com/posts/x',
            snippet: 'Looking for a CRM recommendation.',
            title: 'Post',
        );

        $enriched = app(SocialSignalEnricher::class)->enrich($org, $icp, $hit);

        $this->assertSame([], $enriched['named_people']);
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    public static function nonPersonSignalTypeProvider(): array
    {
        // The 3 default-pack types that do NOT name a person (feeds_enrichment: false).
        return [
            'new_market_entry' => ['new_market_entry', 'New Market Entry'],
            'distribution_partnership_announcement' => ['distribution_partnership_announcement', 'Distribution/Partnership Announcement'],
            'export_trade_activity_mention' => ['export_trade_activity_mention', 'Export/Trade Activity Mention'],
        ];
    }

    #[DataProvider('nonPersonSignalTypeProvider')]
    public function test_non_person_signal_types_do_not_request_named_people_extraction(string $key, string $label): void
    {
        config(['services.glm.api_key' => 'test-glm-key']);

        [, $org] = $this->actingAsOrgMember();
        $icp = \App\Models\IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => \App\Models\IcpProfile::defaultConfig(),
        ]);

        $signalType = \App\Models\SignalTypeDefinition::query()->create([
            'organization_id' => null,
            'key' => $key,
            'label' => $label,
            'trigger_description' => 'Trigger description for ' . $label,
            'pack' => 'default',
            'feeds_enrichment' => false,
            'default_recency_window_days' => 180,
            'active' => true,
        ]);

        $hit = new RawSocialHit(
            platform: 'linkedin',
            sourceLabel: 'LinkedIn',
            sourceIcon: 'in',
            postText: 'Some company news.',
            postUrl: 'https://linkedin.com/posts/x',
            snippet: 'Some company news.',
            title: 'Post',
        );

        \Illuminate\Support\Facades\Http::fake([
            'open.bigmodel.cn/*' => \Illuminate\Support\Facades\Http::response([
                'choices' => [['message' => ['content' => json_encode(['company_name' => 'Acme Corp', 'signal_type' => 'market_signal'])]]],
            ], 200),
        ]);

        app(SocialSignalEnricher::class)->enrich($org, $icp, $hit, $signalType);

        \Illuminate\Support\Facades\Http::assertSent(function ($request) use ($label) {
            $body = $request->body();
            // json_encode escapes "/" as "\/" — the request body is JSON, so the
            // label must be matched in its escaped form (labels like
            // "Distribution/Partnership Announcement" contain a slash).
            $escapedLabel = str_replace('/', '\/', $label);

            return str_contains($body, $escapedLabel)
                && ! str_contains($body, 'expected to name a real person');
        });
    }
}
