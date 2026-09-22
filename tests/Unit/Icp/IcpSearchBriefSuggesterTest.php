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
}
