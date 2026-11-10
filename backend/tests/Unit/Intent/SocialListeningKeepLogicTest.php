<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Intent\SocialListeningOrchestrator;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SocialListeningKeepLogicTest extends TestCase
{
    public function test_recommendation_is_saved_and_a_job_ad_is_not(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => 'test-glm-key',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        $ask = 'Anyone recommend FMCG logistics software in Lagos for a twenty person distribution team';

        Http::fake([
            'api.z.ai/*' => Http::response([
                'choices' => [[
                    'message' => ['content' => json_encode([
                        'signal_type' => 'recommendation',
                        'buying_intent_score' => 82,
                        'summary' => $ask,
                        'evidence_quote' => $ask,
                        'actionability' => 'reply_now',
                        'company_name' => 'ShopCo',
                        'profile_name' => 'Ada',
                    ])],
                ]],
            ], 200),
            'google.serper.dev/*' => Http::sequence()
                ->push([
                    'organic' => [[
                        'title' => 'Anyone recommend FMCG logistics software in Lagos?',
                        'link' => 'https://linkedin.com/posts/rec-1',
                        'snippet' => $ask . '?',
                        'date' => '1 day ago',
                    ]],
                ], 200)
                ->push([
                    'organic' => [[
                        'title' => 'Hiring Head of Sales FMCG Lagos',
                        'link' => 'https://linkedin.com/posts/job-1',
                        'snippet' => 'We are hiring a Head of Sales for our FMCG team in Lagos. Apply now with a resume and salary expectations.',
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
                'signalTypePacks' => [SignalTypeDefinition::PACK_NONE],
            ]),
        ]);

        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 40]
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings);

        $this->assertSame('completed', $run->status);
        $this->assertSame(1, $run->signals_created);
        $this->assertSame(1, SocialSignal::query()->where('organization_id', $org->id)->count());
        $this->assertNotNull(SocialSignal::query()->where('post_url', 'https://linkedin.com/posts/rec-1')->first());
        $this->assertNull(SocialSignal::query()->where('post_url', 'https://linkedin.com/posts/job-1')->first());
        $this->assertGreaterThanOrEqual(1, $run->result_summary['rejected']['notActionable']);
    }

    public function test_glm_outage_saves_nothing(): void
    {
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.social_listening.daily_api_cap' => 500,
        ]);

        Http::fake([
            'google.serper.dev/*' => Http::response([
                'organic' => [[
                    'title' => 'Anyone recommend payroll software?',
                    'link' => 'https://linkedin.com/posts/no-model',
                    'snippet' => 'Anyone recommend a payroll tool for a 20-person team in Lagos this quarter?',
                    'date' => '1 day ago',
                ]],
            ], 200),
        ]);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Payroll',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'We sell payroll software to small teams',
                'signalTypePacks' => [SignalTypeDefinition::PACK_NONE],
            ]),
        ]);
        $settings = SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['enabled_sources' => ['linkedin_public'], 'min_score' => 40]
        ));

        $run = app(SocialListeningOrchestrator::class)->run($org, $icp, $settings);

        $this->assertSame('completed', $run->status);
        $this->assertSame(0, $run->signals_created);
        $this->assertTrue($run->result_summary['model_unavailable']);
        $this->assertSame(0, SocialSignal::query()->where('organization_id', $org->id)->count());
    }
}
