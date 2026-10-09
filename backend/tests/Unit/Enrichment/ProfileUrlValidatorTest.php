<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\ProfileUrlValidator;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ProfileUrlValidatorTest extends TestCase
{
    public function test_trusted_serper_urls_skip_probe(): void
    {
        Http::fake();

        $validator = new ProfileUrlValidator;
        $url = 'https://www.linkedin.com/in/jane-doe';

        $valid = $validator->filterValid([$url], [$url]);

        $this->assertSame([$url], $valid);
        Http::assertNothingSent();
    }

    public function test_explicit_404_is_dropped(): void
    {
        Http::fake([
            'https://www.linkedin.com/in/missing-person' => Http::response('Not Found', 404),
        ]);

        $validator = new ProfileUrlValidator;
        $valid = $validator->filterValid(['https://www.linkedin.com/in/missing-person']);

        $this->assertSame([], $valid);
    }

    public function test_linkedin_anti_bot_999_is_kept(): void
    {
        Http::fake(function () {
            return new \Illuminate\Http\Client\Response(
                new \GuzzleHttp\Psr7\Response(999, [], '')
            );
        });

        $validator = new ProfileUrlValidator;
        $valid = $validator->filterValid(['https://www.linkedin.com/in/real-person']);

        $this->assertSame(['https://www.linkedin.com/in/real-person'], $valid);
    }

    public function test_timeout_keeps_linkedin_in_slug_only(): void
    {
        Http::fake(function () {
            throw new \Illuminate\Http\Client\ConnectionException('timeout');
        });

        $validator = new ProfileUrlValidator;

        $kept = $validator->filterValid(['https://www.linkedin.com/in/timeout-person']);
        $dropped = $validator->filterValid(['https://example.com/about/team/alice']);

        $this->assertSame(['https://www.linkedin.com/in/timeout-person'], $kept);
        $this->assertSame([], $dropped);
    }

    public function test_probe_budget_falls_back_to_linkedin_format(): void
    {
        Http::fake([
            '*' => Http::response('ok', 200),
        ]);

        $validator = new ProfileUrlValidator;

        // Exhaust budget with successful probes.
        for ($i = 0; $i < ProfileUrlValidator::MAX_PROBES_PER_RUN; $i++) {
            $validator->filterValid(["https://example.com/bio/person-{$i}"]);
        }

        $linkedin = $validator->filterValid(['https://www.linkedin.com/in/after-budget']);
        $other = $validator->filterValid(['https://example.com/about/ceo']);

        $this->assertSame(['https://www.linkedin.com/in/after-budget'], $linkedin);
        $this->assertSame([], $other);
    }
}
