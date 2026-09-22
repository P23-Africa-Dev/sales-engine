<?php

namespace Tests\Unit\Discovery;

use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

class DiscoveryOrchestratorYieldGateTest extends TestCase
{
    public function test_trusted_person_in_url_kept_when_firmographics_unknown(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'hasTrustedEntityProfileUrl');

        $brief = $this->peopleBrief();
        $hit = new RawDiscoveryHit(
            name: 'Ada Okoye',
            source: 'serper',
            provider: 'serper',
            url: 'https://www.linkedin.com/in/ada-okoye',
        );

        $this->assertTrue($method->invoke($orchestrator, $brief, [], $hit));
    }

    public function test_post_url_not_trusted_for_unknown_firmographics(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'hasTrustedEntityProfileUrl');

        $brief = $this->peopleBrief();
        $hit = new RawDiscoveryHit(
            name: 'Ada Okoye',
            source: 'serper',
            provider: 'serper',
            url: 'https://www.linkedin.com/posts/ada-okoye_activity-123',
        );

        $this->assertFalse($method->invoke($orchestrator, $brief, [], $hit));
    }

    public function test_company_company_slug_trusted_not_person_in(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'hasTrustedEntityProfileUrl');

        $brief = $this->companyBrief();

        $companyHit = new RawDiscoveryHit(
            name: 'OrbitPay',
            source: 'serper',
            provider: 'serper',
            url: 'https://www.linkedin.com/company/orbitpay',
        );
        $this->assertTrue($method->invoke($orchestrator, $brief, [], $companyHit));

        $personHit = new RawDiscoveryHit(
            name: 'OrbitPay',
            source: 'serper',
            provider: 'serper',
            url: 'https://www.linkedin.com/in/someone',
        );
        $this->assertFalse($method->invoke($orchestrator, $brief, [], $personHit));
    }

    public function test_linkedin_host_never_stored_as_website(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'isProfileOrSocialHost');

        $this->assertTrue($method->invoke($orchestrator, 'https://www.linkedin.com/in/ada'));
        $this->assertTrue($method->invoke($orchestrator, 'linkedin.com'));
        $this->assertFalse($method->invoke($orchestrator, 'https://novapay.example.com'));
    }

    public function test_soft_complete_refuses_under_half_quota(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $ref = new ReflectionClass($orchestrator);

        $startedAt = $ref->getProperty('startedAt');
        $startedAt->setAccessible(true);
        $startedAt->setValue($orchestrator, microtime(true) - 100);

        $deadlineAt = $ref->getProperty('deadlineAt');
        $deadlineAt->setAccessible(true);
        $deadlineAt->setValue($orchestrator, microtime(true) + 10);

        $method = $this->privateMethod($orchestrator, 'shouldSoftCompletePass');

        // 4 leads vs limit 12 → under half (6) → do not soft-complete
        $this->assertFalse($method->invoke($orchestrator, 4, 1, 4, 12));

        // 6 leads vs limit 12 → at half → soft-complete allowed when time pressure met
        $this->assertTrue($method->invoke($orchestrator, 3, 1, 6, 12));
    }

    public function test_hard_gate_drops_india_but_skips_blank_location_when_icp_is_nigeria(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'passesIcpHardGate');

        $brief = $this->companyBriefNigeria();

        $this->assertFalse($method->invoke($orchestrator, $brief, [
            'location' => 'Pune, India',
            'industry' => 'Logistics',
        ]));
        $this->assertTrue($method->invoke($orchestrator, $brief, [
            'industry' => 'Logistics',
        ]));
        $this->assertTrue($method->invoke($orchestrator, $brief, [
            'location' => 'Lagos, Nigeria',
            'industry' => 'Logistics',
        ]));
        $this->assertFalse($method->invoke($orchestrator, $brief, [
            'location' => 'Austin, USA',
            'industry' => 'Logistics',
        ]));
    }

    public function test_gather_prefers_hunter_ng_over_bare_serper(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'gatherPriority');
        $brief = $this->companyBriefNigeria();

        $hunter = new RawDiscoveryHit(
            name: 'Kobo Logistics',
            source: 'database',
            provider: 'hunter',
            website: 'kobo360.com',
            location: 'NG',
            url: 'https://kobo360.com',
        );
        $serper = new RawDiscoveryHit(
            name: 'Random Freight Blog',
            source: 'serper',
            provider: 'serper',
            url: 'https://example.com/freight',
            snippet: 'A logistics directory listing.',
        );

        $this->assertGreaterThan(
            $method->invoke($orchestrator, $serper, $brief),
            $method->invoke($orchestrator, $hunter, $brief),
        );
    }

    public function test_hard_gate_allows_unknown_industry_when_territories_empty(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'passesIcpHardGate');

        $brief = new IcpBrief(
            name: 'Industry ICP',
            description: '',
            industries: ['Construction'],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 1,
            autoSyncCrm: false,
            query: 'give me prospects',
            target: 'companies',
        );

        $this->assertTrue($method->invoke($orchestrator, $brief, [
            'name' => 'OrbitPay',
        ]));
    }

    public function test_strong_geo_proxy_matches_ng_linkedin_for_nigeria_icp(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'hasStrongGeoProxy');
        $brief = $this->companyBriefNigeria();

        $hit = new RawDiscoveryHit(
            name: 'Kobo360',
            source: 'serper',
            provider: 'serper',
            url: 'https://ng.linkedin.com/company/kobo360',
            snippet: 'Logistics platform',
        );

        $this->assertTrue($method->invoke($orchestrator, $brief, $hit, []));
    }

    public function test_non_entity_urls_are_filtered(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'isNonEntityLeadUrl');

        $this->assertTrue($method->invoke($orchestrator, 'https://www.linkedin.com/pulse/big-bulky'));
        $this->assertTrue($method->invoke($orchestrator, 'https://www.linkedin.com/posts/someone_activity-123'));
        $this->assertFalse($method->invoke($orchestrator, 'https://www.linkedin.com/company/kobo360'));
        $this->assertFalse($method->invoke($orchestrator, 'https://www.linkedin.com/in/ada-okoye'));
    }

    public function test_gather_cap_allows_more_candidates_for_default_limit(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'gatherCap');

        $this->assertSame(48, $method->invoke($orchestrator, 12));
        $this->assertSame(60, $method->invoke($orchestrator, 20));
    }

    public function test_advisory_cap_keeps_recommended_and_limits_low_confidence(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'applyAdvisoryCap');

        $leads = [];
        for ($i = 1; $i <= 10; $i++) {
            $leads[] = [
                'name' => "Strong {$i}",
                'icp_recommended' => true,
                'low_confidence' => false,
                'score' => 90 - $i,
            ];
        }
        for ($i = 1; $i <= 10; $i++) {
            $leads[] = [
                'name' => "Weak {$i}",
                'icp_recommended' => false,
                'low_confidence' => true,
                'score' => 40,
            ];
        }

        $capped = $method->invoke($orchestrator, $leads, 12);
        $this->assertCount(12, $capped);
        $advisory = array_values(array_filter(
            $capped,
            fn (array $l) => (bool) ($l['low_confidence'] ?? false) || ! (bool) ($l['icp_recommended'] ?? false),
        ));
        $this->assertLessThanOrEqual(3, count($advisory));
        $this->assertGreaterThanOrEqual(9, count($capped) - count($advisory));
    }

    private function companyBriefNigeria(): IcpBrief
    {
        return new IcpBrief(
            name: 'NG ICP',
            description: '',
            industries: ['Logistics'],
            territories: ['Nigeria'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: 'logistics 3PL',
            minMatchScore: 1,
            autoSyncCrm: false,
            query: 'give me prospects',
            target: 'companies',
        );
    }

    private function peopleBrief(): IcpBrief
    {
        return new IcpBrief(
            name: 'UK ICP',
            description: 'UK buyers',
            industries: ['Construction'],
            territories: ['United Kingdom'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 1,
            autoSyncCrm: false,
            query: 'give me prospects',
            target: 'people',
        );
    }

    private function companyBrief(): IcpBrief
    {
        return new IcpBrief(
            name: 'UK ICP',
            description: 'UK buyers',
            industries: ['Construction'],
            territories: ['United Kingdom'],
            companySizes: [],
            decisionMakers: [],
            customPrompt: '',
            minMatchScore: 1,
            autoSyncCrm: false,
            query: 'give me prospects',
            target: 'companies',
        );
    }

    private function privateMethod(object $object, string $name): ReflectionMethod
    {
        $method = new ReflectionMethod($object, $name);
        $method->setAccessible(true);

        return $method;
    }
}
