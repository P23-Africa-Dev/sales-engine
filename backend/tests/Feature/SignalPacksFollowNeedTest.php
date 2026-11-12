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
    /**
     * @return list<string>
     */
    private function keys(string $mode, array $packs = []): array
    {
        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(new IcpProfile([
            'name' => 'X',
            'config' => array_merge(IcpProfile::defaultConfig(), ['signalTypePacks' => $packs]),
        ]));
        $method = new ReflectionMethod(SocialListeningOrchestrator::class, 'activeDefinitions');

        return $method->invoke(app(SocialListeningOrchestrator::class), $org->id, $brief, new ListeningProfile($mode, 'x', [], false, []))
            ->pluck('key')->sort()->values()->all();
    }

    private function definitions(string $mode, array $packs = []): int
    {
        return count($this->keys($mode, $packs));
    }

    public function test_default_buyer_packs_run_for_a_customers_need(): void
    {
        $this->assertGreaterThan(0, $this->definitions('sell'));
    }

    public function test_partner_needs_watch_the_same_company_events(): void
    {
        $this->assertContains('distribution_partnership_announcement', $this->keys('partner'));
        $this->assertContains('new_market_entry', $this->keys('partner'));
    }

    public function test_supplier_and_funding_needs_get_their_own_packs_not_buyer_signals(): void
    {
        $this->assertSame(['new_supply_availability', 'supplier_export_readiness'], $this->keys('source'));
        $this->assertSame(['call_for_applications', 'fund_launch'], $this->keys('raise'));
        $this->assertSame(0, $this->definitions('invest'));
    }

    public function test_packs_the_user_chose_are_still_honoured(): void
    {
        $this->assertGreaterThan(0, $this->definitions('source', [SignalTypeDefinition::PACK_SOFTWARE_DEV]));
    }
}
