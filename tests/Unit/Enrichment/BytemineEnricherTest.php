<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\BytemineEnricher;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BytemineEnricherTest extends TestCase
{
    public function test_is_disabled_without_api_key(): void
    {
        config(['services.bytemine.api_key' => '']);

        $this->assertFalse(app(BytemineEnricher::class)->isEnabled());
    }

    public function test_enriches_person_and_reports_credits(): void
    {
        config([
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'bytemine.example.com/v1/people/enrich' => Http::response([
                'matched' => true,
                'credits_charged' => 1,
                'workEmail' => 'jane@acme.com',
                'mobilePhone' => '+15551234567',
                'linkedin' => 'https://www.linkedin.com/in/janedoe',
                'title' => 'CEO',
                'companyName' => 'Acme',
            ], 200),
        ]);

        $result = app(BytemineEnricher::class)->enrichPerson($org, 'Jane Doe', [
            'domain' => 'acme.com',
        ]);

        $this->assertSame('jane@acme.com', $result['email']);
        $this->assertSame('+15551234567', $result['phone']);
        $this->assertSame(1, $result['credits_used']);
    }

    public function test_returns_empty_when_credits_exhausted(): void
    {
        config([
            'services.bytemine.api_key' => 'bm-test',
            'services.bytemine.base_url' => 'https://bytemine.example.com/v1',
        ]);

        [, $org] = $this->actingAsOrgMember();

        Http::fake([
            'bytemine.example.com/v1/people/enrich' => Http::response(['error' => 'quota'], 402),
        ]);

        $result = app(BytemineEnricher::class)->enrichPerson($org, 'Jane Doe', [
            'domain' => 'acme.com',
        ]);

        $this->assertSame([], $result);
    }
}
