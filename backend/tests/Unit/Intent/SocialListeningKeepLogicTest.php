<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningSetting;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialListeningOrchestrator;
use App\Services\Intent\SocialSignalEnricher;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SocialListeningKeepLogicTest extends TestCase
{
    public function test_orchestrator_keeps_normalized_hiring_and_recommendation_signals(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::sequence()
                ->push([
                    'organic' => [[
                        'title' => 'Anyone recommend FMCG logistics software in Lagos?',
                        'link' => 'https://linkedin.com/posts/rec-1',
                        'snippet' => 'Looking for recommendations on FMCG distribution tools in Lagos.',
                        'date' => '1 day ago',
                    ]],
                ], 200)
                ->push([
                    'organic' => [[
                        'title' => 'Hiring Head of Sales FMCG Lagos',
                        'link' => 'https://x.com/job-1',
                        'snippet' => 'We are hiring a Head of Sales for our FMCG team in Lagos.',
                        'date' => '1 day ago',
                    ]],
                ], 200)
                ->whenEmpty(Http::response(['organic' => []], 200)),
        ]);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FMCG & Retail'],
                'territories' => ['Lagos, NG'],
                'decisionMakers' => ['Head of Sales'],
                'signalTypePacks' => [\App\Models\SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['min_score' => 40]
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings);

        $this->assertSame('completed', $run->status);
        $this->assertGreaterThan(0, $run->signals_created);
        $this->assertDatabaseCount('social_signals', $run->signals_created);
    }
}
