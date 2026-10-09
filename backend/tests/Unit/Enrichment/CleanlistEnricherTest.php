<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\CleanlistEnricher;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CleanlistEnricherTest extends TestCase
{
    public function test_is_disabled_without_api_key(): void
    {
        config(['services.cleanlist.api_key' => '']);

        $this->assertFalse(app(CleanlistEnricher::class)->isEnabled());
    }

    public function test_enriches_person_from_nested_payload(): void
    {
        config([
            'services.cleanlist.api_key' => 'cl-test',
            'services.cleanlist.base_url' => 'https://cleanlist.example.com/v1',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'cleanlist.example.com/v1/people/enrich' => Http::response([
                'matched' => true,
                'credits_charged' => 11,
                'person' => [
                    'work_email' => 'jane@acme.com',
                    'phone' => '+15559876543',
                    'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
                    'title' => 'CTO',
                    'company_name' => 'Acme',
                ],
            ], 200),
        ]);

        $result = app(CleanlistEnricher::class)->enrichPerson($org, 'Jane Doe', [
            'domain' => 'acme.com',
            'linkedin_url' => 'https://www.linkedin.com/in/janedoe',
        ]);

        $this->assertSame('jane@acme.com', $result['email']);
        $this->assertSame('+15559876543', $result['phone']);
        $this->assertSame(11, $result['credits_used']);
    }

    public function test_no_match_uses_zero_credits(): void
    {
        config([
            'services.cleanlist.api_key' => 'cl-test',
            'services.cleanlist.base_url' => 'https://cleanlist.example.com/v1',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'cleanlist.example.com/v1/people/enrich' => Http::response([
                'matched' => false,
            ], 200),
        ]);

        $result = app(CleanlistEnricher::class)->enrichPerson($org, 'Jane Doe', [
            'domain' => 'acme.com',
        ]);

        $this->assertSame(0, $result['credits_used']);
        $this->assertArrayNotHasKey('email', $result);
    }
}
