<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialSignal;
use App\Services\Intent\SocialSignalEnricher;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RequalifySocialSignalsCommandTest extends TestCase
{
    private IcpProfile $icp;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.glm.api_key' => 'test-glm', 'services.glm.base_url' => 'https://glm.example.com']);
        Http::fake(); // the listening planner falls back to its heuristic profile
        Storage::fake('local');

        [, $org] = $this->actingAsOrgMember();
        $this->orgId = $org->id;
        // The account NEEDS cocoa suppliers; old signals were qualified as if it SOLD cocoa.
        $this->icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Cocoa sourcing',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'customPrompt' => 'reliable cocoa bean suppliers in Ghana',
                'territories' => ['Ghana'],
            ]),
        ]);
    }

    private function signal(string $text, string $status = 'new', array $extra = []): SocialSignal
    {
        return SocialSignal::query()->create(array_merge([
            'organization_id' => $this->orgId,
            'icp_profile_id' => $this->icp->id,
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => $text,
            'post_url' => 'https://www.linkedin.com/posts/x-activity-7330955130554466307-abcd',
            'score' => 80,
            'status' => $status,
            'why_this_matters_to_you' => 'This buyer needs cocoa — sell to them.',
        ], $extra));
    }

    /**
     * Qualifier verdicts keyed by post text.
     *
     * @param  array<string, array<string, mixed>>  $verdicts
     */
    private function fakeQualifier(array $verdicts): void
    {
        $this->mock(SocialSignalEnricher::class, function ($mock) use ($verdicts) {
            $mock->shouldReceive('enrichMany')->andReturnUsing(function ($org, $icp, array $items) use ($verdicts) {
                $out = [];
                foreach ($items as $key => $item) {
                    $out[$key] = $verdicts[$item['hit']->postText] ?? [];
                }

                return $out;
            });
        });
    }

    private const SUPPLIER = 'We supply grade A cocoa beans in bulk from Kumasi, Ghana. Contact us for the current price list.';

    private const BUYER = 'Anyone know where to buy chocolate bars wholesale? We are a cafe in Accra looking for a distributor.';

    private function verdicts(): array
    {
        return [
            self::SUPPLIER => [
                'actionability' => 'reply_now', 'author_role' => 'vendor', 'signal_type' => 'market_signal', 'score' => 82,
                'evidence_quote' => 'We supply grade A cocoa beans in bulk from Kumasi, Ghana.',
                'why_this_matters_to_you' => 'You are looking for reliable cocoa bean suppliers in Ghana; this exporter is offering bulk supply.',
                'suggested_message' => 'Hi — could you share your current price list and minimum order?',
            ],
            self::BUYER => [
                'actionability' => 'not_an_opportunity', 'author_role' => 'buyer', 'signal_type' => 'recommendation', 'score' => 30,
                'evidence_quote' => 'Anyone know where to buy chocolate bars wholesale?',
            ],
        ];
    }

    public function test_dry_run_reports_without_changing_anything(): void
    {
        $this->fakeQualifier($this->verdicts());
        $buyer = $this->signal(self::BUYER);

        $this->artisan('social-signals:requalify')->assertSuccessful();

        $this->assertSame('new', $buyer->fresh()->status);
        $files = Storage::disk('local')->files('requalify');
        $this->assertCount(1, $files);
        $report = json_decode(Storage::disk('local')->get($files[0]), true);
        $this->assertSame('retired', collect($report['signals'])->firstWhere('id', $buyer->id)['verdict']);
    }

    public function test_apply_retires_false_signals_and_refreshes_kept_ones(): void
    {
        $this->fakeQualifier($this->verdicts());
        $supplier = $this->signal(self::SUPPLIER);
        $buyer = $this->signal(self::BUYER, 'reviewed');

        $this->artisan('social-signals:requalify --apply')->assertSuccessful();

        $buyer->refresh();
        $this->assertSame(SocialSignal::STATUS_RETIRED, $buyer->status);
        $this->assertSame('reviewed', $buyer->meta['requalify']['retired_from_status']);

        $supplier->refresh();
        $this->assertSame('new', $supplier->status);
        $this->assertStringContainsString('looking for reliable cocoa bean suppliers', $supplier->why_this_matters_to_you);

        // Retired signals leave the user's feed.
        $this->withHeaders($this->orgHeaders(Organization::query()->find($this->orgId)))
            ->getJson('/api/v1/social-listening/signals')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_signals_the_user_acted_on_are_never_touched(): void
    {
        $this->fakeQualifier($this->verdicts());
        $synced = $this->signal(self::BUYER, 'synced');

        $this->artisan('social-signals:requalify --apply')->assertSuccessful();

        $this->assertSame('synced', $synced->fresh()->status);
    }

    public function test_no_model_answer_means_leave_it_alone(): void
    {
        $this->fakeQualifier([]);
        $signal = $this->signal(self::BUYER);

        $this->artisan('social-signals:requalify --apply')->assertSuccessful();

        $this->assertSame('new', $signal->fresh()->status);
    }

    public function test_restore_puts_retired_signals_back(): void
    {
        $this->fakeQualifier($this->verdicts());
        $buyer = $this->signal(self::BUYER, 'reviewed');
        $this->artisan('social-signals:requalify --apply')->assertSuccessful();
        $report = collect(Storage::disk('local')->files('requalify'))->first();

        $this->artisan('social-signals:requalify', ['--restore' => $report])->assertSuccessful();

        $this->assertSame('reviewed', $buyer->fresh()->status);
    }

    public function test_refuses_to_run_without_the_ai_qualifier(): void
    {
        config(['services.glm.api_key' => '']);
        $signal = $this->signal(self::BUYER);

        $this->artisan('social-signals:requalify --apply')->assertFailed();

        $this->assertSame('new', $signal->fresh()->status);
    }
}
