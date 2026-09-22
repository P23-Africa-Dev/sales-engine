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

    public function test_hard_gate_drops_india_and_missing_location_when_icp_is_nigeria(): void
    {
        $orchestrator = app(DiscoveryOrchestrator::class);
        $method = $this->privateMethod($orchestrator, 'passesIcpHardGate');

        $brief = $this->companyBriefNigeria();

        $this->assertFalse($method->invoke($orchestrator, $brief, [
            'location' => 'Pune, India',
            'industry' => 'Logistics',
        ]));
        $this->assertFalse($method->invoke($orchestrator, $brief, [
            'industry' => 'Logistics',
        ]));
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
