<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\HunterEmailVerifier;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class HunterEmailVerifierTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function hunterStatuses(): array
    {
        return [
            'valid' => ['valid', 'verified'],
            'accept_all' => ['accept_all', 'likely'],
            'unknown' => ['unknown', 'likely'],
            'invalid' => ['invalid', 'invalid'],
        ];
    }

    #[DataProvider('hunterStatuses')]
    public function test_hunter_status_is_mapped(string $hunterStatus, string $expected): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key', 'services.contact_finder.verify_emails' => true]);
        Http::preventStrayRequests();
        Http::fake(['api.hunter.io/v2/email-verifier*' => Http::response(['data' => ['status' => $hunterStatus]])]);
        [, $org] = $this->actingAsOrgMember();

        $this->assertSame($expected, app(HunterEmailVerifier::class)->verify($org, 'jane.doe@acme.com'));

        Http::assertSent(fn (Request $request) => $request->header('X-API-KEY') === ['test-hunter-key']
            && $request['email'] === 'jane.doe@acme.com'
            && ! str_contains($request->url(), 'test-hunter-key'));
    }

    public function test_results_are_cached_so_an_address_is_checked_once(): void
    {
        config(['services.hunter.api_key' => 'test-hunter-key']);
        Http::fake(['api.hunter.io/*' => Http::response(['data' => ['status' => 'valid']])]);
        [, $org] = $this->actingAsOrgMember();
        $verifier = app(HunterEmailVerifier::class);

        $verifier->verify($org, 'jane.doe@acme.com');
        $this->assertSame('verified', $verifier->verify($org, 'Jane.Doe@acme.com'));

        Http::assertSentCount(1);
        $this->assertDatabaseHas('enrichment_logs', ['provider' => 'hunter_verifier', 'credits_used' => 1]);
    }

    public function test_nothing_is_sent_without_a_key_and_failures_are_not_a_verdict(): void
    {
        config(['services.hunter.api_key' => '']);
        Http::fake(['api.hunter.io/*' => Http::response([], 500)]);
        [, $org] = $this->actingAsOrgMember();
        $verifier = app(HunterEmailVerifier::class);

        $this->assertNull($verifier->verify($org, 'jane.doe@acme.com'));
        Http::assertNothingSent();

        config(['services.hunter.api_key' => 'test-hunter-key']);
        $this->assertNull($verifier->verify($org, 'jane.doe@acme.com'));
    }
}
