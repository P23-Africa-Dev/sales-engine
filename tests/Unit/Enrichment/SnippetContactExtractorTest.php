<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\SnippetContactExtractor;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SnippetContactExtractorTest extends TestCase
{
    public function test_regex_extracts_email_and_phone_from_snippets_without_glm(): void
    {
        config(['services.glm.api_key' => '']);

        $extractor = app(SnippetContactExtractor::class);
        [, $org] = $this->actingAsOrgMember();

        $result = $extractor->extractFromSnippets(
            $org,
            'Jane Doe',
            'Acme Corp',
            [
                [
                    'title' => 'Jane Doe — Acme',
                    'snippet' => 'Reach Jane at jane.doe@acmecorp.com or +1 (415) 555-0199.',
                    'url' => 'https://acmecorp.com/team/jane',
                ],
            ],
        );

        $this->assertSame('jane.doe@acmecorp.com', $result['email']);
        $this->assertNotEmpty($result['phone']);
    }

    public function test_rejects_generic_mailbox_emails(): void
    {
        $extractor = app(SnippetContactExtractor::class);

        $this->assertNull($extractor->sanitizeEmail('info@acme.com'));
        $this->assertNull($extractor->sanitizeEmail('contact@acme.com'));
        $this->assertSame('jane@acme.com', $extractor->sanitizeEmail('jane@acme.com'));
    }

    public function test_glm_extract_merges_validated_contacts(): void
    {
        config([
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'email' => 'ceo@example.com',
                            'phone' => '+14155550100',
                            'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
                            'confidence' => 80,
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        $extractor = app(SnippetContactExtractor::class);
        $result = $extractor->extractFromSnippets(
            $org,
            'Jane Doe',
            'Example',
            [
                [
                    'title' => 'Jane Doe',
                    'snippet' => 'Executive profile.',
                    'url' => 'https://example.com',
                ],
            ],
        );

        $this->assertSame('ceo@example.com', $result['email']);
        $this->assertSame('+14155550100', $result['phone']);
        $this->assertStringContainsString('linkedin.com/in/', $result['linkedin_url']);
    }
}
