<?php

namespace Tests\Unit\Icp;

use App\Services\Icp\IcpSearchBriefSuggester;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IcpSearchBriefSuggesterTest extends TestCase
{
    public function test_deterministic_logistics_omits_nigeria_and_job_titles(): void
    {
        $suggester = app(IcpSearchBriefSuggester::class);

        $result = $suggester->deterministic([
            'mode' => 'generate',
            'industries' => ['Logistics & Fleet'],
            'territories' => ['Nigeria', 'Lagos, NG'],
            'decisionMakers' => ['CEO', 'Head of Sales'],
        ]);

        $this->assertNotSame('', $result['brief']);
        $this->assertStringContainsString('3PL', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('nigeria', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('lagos', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('ceo', $result['brief']);
        $this->assertNotEmpty($result['keywords']);
        $this->assertContains('Logistics & Fleet', $result['industries']);
        $this->assertNotEmpty($result['decisionMakers']);
        $this->assertContains('51-200', $result['companySizes']);
        $this->assertSame(60, $result['minMatchScore']);
    }

    public function test_sanitize_strips_glm_geo_and_persona_leak(): void
    {
        $suggester = app(IcpSearchBriefSuggester::class);

        $result = $suggester->sanitize([
            'brief' => 'Nigeria Lagos 3PL last-mile delivery companies for CEOs',
            'keywords' => ['Lagos 3PL', 'last-mile', 'CEO outreach'],
        ], [
            'territories' => ['Nigeria', 'Lagos, NG'],
            'decisionMakers' => ['CEO'],
        ]);

        $this->assertStringNotContainsStringIgnoringCase('nigeria', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('lagos', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('ceo', $result['brief']);
        $this->assertStringContainsString('3PL', $result['brief']);
        foreach ($result['keywords'] as $keyword) {
            $this->assertStringNotContainsStringIgnoringCase('lagos', $keyword);
            $this->assertStringNotContainsStringIgnoringCase('ceo', $keyword);
        }
    }

    public function test_glm_suggestion_is_sanitized(): void
    {
        config([
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.chat_model' => 'glm-test',
        ]);

        Http::fake([
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'brief' => '3PL cargo and e-commerce last-mile delivery companies in Nigeria',
                            'keywords' => ['3PL', 'last-mile', 'Lagos freight'],
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        [, $org] = $this->createUserWithOrg();

        $result = app(IcpSearchBriefSuggester::class)->suggest($org, [
            'mode' => 'generate',
            'industries' => ['Logistics & Fleet'],
            'territories' => ['Nigeria'],
        ]);

        $this->assertSame('glm', $result['source']);
        $this->assertStringContainsString('3PL', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('nigeria', $result['brief']);
    }

    public function test_improve_empty_box_falls_back_to_generate_from_description(): void
    {
        $suggester = app(IcpSearchBriefSuggester::class);

        $result = $suggester->deterministic([
            'mode' => 'improve',
            'customPrompt' => '',
            'profileName' => 'Cold chain ICP',
            'description' => 'Cold-chain storage providers hiring operations leads',
            'industries' => ['Logistics & Fleet'],
            'territories' => ['Nigeria'],
        ]);

        $this->assertNotSame('', $result['brief']);
        $this->assertStringNotContainsStringIgnoringCase('nigeria', $result['brief']);
        $this->assertGreaterThanOrEqual(4, count($result['keywords']));
    }

    public function test_improve_keeps_user_niche_nouns(): void
    {
        $suggester = app(IcpSearchBriefSuggester::class);

        $result = $suggester->deterministic([
            'mode' => 'improve',
            'customPrompt' => 'cold chain storage providers exclude brokers',
            'industries' => ['Logistics & Fleet'],
            'territories' => ['Germany'],
        ]);

        $brief = mb_strtolower($result['brief']);
        $this->assertTrue(
            str_contains($brief, 'cold') || str_contains($brief, 'chain') || str_contains($brief, 'storage'),
            'Improve should keep user niche nouns'
        );
        $this->assertStringNotContainsStringIgnoringCase('germany', $result['brief']);
    }
}
