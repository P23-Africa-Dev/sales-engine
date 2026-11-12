<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\SocialListeningOrchestrator;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Built-in signal packs are buyer signals; they only make sense when the account needs customers.
 */
class SignalPacksFollowNeedTest extends TestCase
{
    private function definitions(string $mode, array $packs = []): int
    {
        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'X',
            'config' => array_merge(IcpProfile::defaultConfig(), ['signalTypePacks' => $packs]),
        ]));
        $method = new ReflectionMethod(SocialListeningOrchestrator::class, 'activeDefinitions');

        return $method->invoke(app(SocialListeningOrchestrator::class), $org->id, $brief, new ListeningProfile($mode, 'x', [], false, []))->count();
    }

    public function test_default_buyer_packs_run_for_a_customers_need(): void
    {
        $this->assertGreaterThan(0, $this->definitions('sell'));
    }

    public function test_default_buyer_packs_are_skipped_for_supplier_and_funding_needs(): void
    {
        $this->assertSame(0, $this->definitions('source'));
        $this->assertSame(0, $this->definitions('raise'));
    }

    public function test_packs_the_user_chose_are_still_honoured(): void
    {
        $this->assertGreaterThan(0, $this->definitions('source', [SignalTypeDefinition::PACK_SOFTWARE_DEV]));
    }
}
