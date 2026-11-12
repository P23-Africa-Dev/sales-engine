<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\PersonHeadlineResolver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PersonHeadlineResolverTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.serper.api_key' => 'test-serper', 'services.serper.base_url' => 'https://google.serper.dev']);
        Cache::flush();
    }

    public function test_fills_role_and_employer_from_the_same_persons_profile_only(): void
    {
        Http::fake([
            'google.serper.dev/search' => Http::sequence()
                ->push(['organic' => [
                    // Another person's profile in the results: ignored.
                    ['title' => 'Bola Ade - CEO - Paystack | LinkedIn', 'link' => 'https://ng.linkedin.com/in/bola-ade', 'snippet' => 'CEO at Paystack'],
                    ['title' => 'Daluchi Iweanya - Head of Compliance - Moniepoint | LinkedIn', 'link' => 'https://ng.linkedin.com/in/daluchi-iweanya', 'snippet' => 'Experience: Moniepoint · Location: Lagos'],
                ]])
                ->push(['organic' => [
                    ['title' => 'Imoleayo Ashaye | LinkedIn', 'link' => 'https://ng.linkedin.com/in/imoleayo-ashaye-a97085131', 'snippet' => 'Fraud Analyst | Country Manager Kenya'],
                ]]),
        ]);

        $rows = app(PersonHeadlineResolver::class)->fill([
            ['person_name' => 'Daluchi Iweanya', 'linkedin_url' => 'https://ng.linkedin.com/in/daluchi-iweanya'],
            ['person_name' => 'Imoleayo Ashaye', 'title' => 'Fraud Analyst', 'linkedin_url' => 'https://ng.linkedin.com/in/imoleayo-ashaye-a97085131'],
            ['name' => 'Moniepoint', 'title' => '', 'website' => 'https://moniepoint.com'],
        ]);

        $this->assertSame('Head of Compliance', $rows[0]['title']);
        $this->assertSame('Moniepoint', $rows[0]['company']);
        $this->assertSame('profile_headline', $rows[0]['role_source']);
        // Existing title kept; a role fragment is never taken as the employer.
        $this->assertSame('Fraud Analyst', $rows[1]['title']);
        $this->assertArrayNotHasKey('company', $rows[1]);
        // Company rows are left alone and cost no search.
        $this->assertSame('Moniepoint', $rows[2]['name']);
        Http::assertSentCount(2);
    }
}
