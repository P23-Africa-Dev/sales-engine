<?php

namespace Tests\Unit\Discovery;

use App\Models\IcpProfile;
use App\Services\Discovery\LeadQueryNormalizer;
use Tests\TestCase;

class LeadQueryNormalizerTest extends TestCase
{
    public function test_meta_prompt_request_becomes_actionable_icp_query(): void
    {
        $normalizer = app(LeadQueryNormalizer::class);
        $icp = new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => [
                'industries' => ['Fintech & Payments', 'SaaS'],
                'territories' => ['Nigeria', 'Africa'],
                'decisionMakers' => ['CEO', 'Founder', 'Head of Partnerships'],
            ],
        ]);

        $out = $normalizer->normalize(
            'Okay. Give me a prompt i can use to generate leads of potential people or industries that can scale my Ajo FinTech Application.',
            $icp,
        );

        $this->assertFalse($normalizer->isMetaPromptRequest($out));
        $this->assertStringNotContainsString('prompt', mb_strtolower($out));
        $this->assertMatchesRegularExpression('/ajo|fintech|companies|nigeria|africa/i', $out);
    }

    public function test_specific_ceo_query_is_preserved(): void
    {
        $normalizer = app(LeadQueryNormalizer::class);
        $icp = new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => IcpProfile::defaultConfig(),
        ]);

        $query = 'CEOs of FinTech startups in Africa specializing in mobile payments.';
        $out = $normalizer->normalize($query, $icp);

        $this->assertSame($query, $out);
    }

    public function test_generic_request_falls_back_to_icp_seed(): void
    {
        $normalizer = app(LeadQueryNormalizer::class);
        $icp = new IcpProfile([
            'name' => 'My Tech ICP',
            'config' => [
                'industries' => ['FinTech'],
                'territories' => ['Lagos'],
                'decisionMakers' => ['CEO', 'CTO'],
            ],
        ]);

        $out = $normalizer->normalize('generate leads', $icp);

        $this->assertStringContainsString('FinTech', $out);
        $this->assertStringContainsString('Lagos', $out);
        $this->assertStringContainsString('companies', $out);
        $this->assertStringNotContainsString('CEO', $out);
    }

    public function test_ideal_prospect_for_brand_seeds_from_icp(): void
    {
        $normalizer = app(LeadQueryNormalizer::class);
        $icp = new IcpProfile([
            'name' => 'Tommy Test',
            'config' => [
                'industries' => ['FMCG & Retail', 'textile'],
                'territories' => ['Lagos, NG', 'Nigeria'],
                'decisionMakers' => ['Head of Sales', 'Managing Director / CEO'],
            ],
        ]);

        $out = $normalizer->normalize('kind generate ideal prospect for my brand', $icp);

        $this->assertStringNotContainsString('kind generate ideal', mb_strtolower($out));
        $this->assertMatchesRegularExpression('/fmcg|textile|lagos|sales/i', $out);
        $this->assertLessThanOrEqual(80, mb_strlen($out), 'Seed query should stay short for Serper yield');
    }

    public function test_first_batch_people_queries_prefer_linkedin(): void
    {
        $normalizer = app(LeadQueryNormalizer::class);
        $icp = new IcpProfile([
            'name' => 'Tommy Test',
            'config' => [
                'industries' => ['textile'],
                'territories' => ['Lagos, NG'],
                'decisionMakers' => ['Head of Sales', 'CEO'],
            ],
        ]);

        $queries = $normalizer->firstBatchPeopleQueries($icp);
        $this->assertNotEmpty($queries);
        $this->assertTrue(collect($queries)->contains(fn ($q) => str_contains($q, 'site:linkedin.com/in')));
        $this->assertTrue(collect($queries)->contains(fn ($q) => str_contains($q, 'Head of Sales')));
    }
}
