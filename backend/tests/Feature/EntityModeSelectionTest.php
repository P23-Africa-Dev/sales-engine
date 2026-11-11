<?php

namespace Tests\Feature;

use App\Jobs\ProcessChatIntentJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class EntityModeSelectionTest extends TestCase
{
    public function test_explicit_entity_mode_overrides_keyword_guessing_and_locks_the_target(): void
    {
        $icp = new IcpProfile(['name' => 'X', 'config' => IcpProfile::defaultConfig()]);

        // "companies" in the prompt used to win; the user's picker choice must.
        $brief = IcpBrief::fromIcpProfile($icp, 'find fintech companies in Lagos', 'people');

        $this->assertSame(QueryIntentService::TARGET_PEOPLE, $brief->target);
        $this->assertTrue($brief->targetLocked);
        $this->assertTrue($brief->withTerritories(['Nigeria'])->targetLocked);
    }

    public function test_legacy_mode_cue_is_authoritative_and_stripped_from_the_search_text(): void
    {
        $icp = new IcpProfile(['name' => 'X', 'config' => IcpProfile::defaultConfig()]);

        $brief = IcpBrief::fromIcpProfile($icp, 'fintech startups in Lagos (people only)');

        $this->assertSame(QueryIntentService::TARGET_PEOPLE, $brief->target);
        $this->assertTrue($brief->targetLocked);
        $this->assertStringNotContainsString('only', $brief->query);
        $this->assertStringNotContainsString('(', $brief->searchQuery());
    }

    public function test_without_a_choice_the_target_is_inferred_and_not_locked(): void
    {
        $icp = new IcpProfile(['name' => 'X', 'config' => IcpProfile::defaultConfig()]);

        $brief = IcpBrief::fromIcpProfile($icp, 'CEOs at fintech startups in Lagos');

        $this->assertSame(QueryIntentService::TARGET_PEOPLE, $brief->target);
        $this->assertFalse($brief->targetLocked);
    }

    public function test_entity_mode_and_count_are_stored_on_the_user_message_for_the_run(): void
    {
        config(['queue.default' => 'redis', 'services.glm.api_key' => '']);
        Queue::fake();

        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FMCG',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'Top FMCG distributors in Lagos',
                'intent' => 'generate_leads',
                'entity_mode' => 'people',
                'count' => 25,
            ])
            ->assertStatus(202);

        Queue::assertPushed(ProcessChatIntentJob::class);
        $message = ChatMessage::query()->where('chat_session_id', $session->id)->where('role', 'user')->firstOrFail();
        $this->assertSame('people', $message->meta['entity_mode']);
        $this->assertSame(25, $message->meta['requested_count']);
    }

    public function test_invalid_entity_mode_is_rejected(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'find leads',
                'intent' => 'generate_leads',
                'entity_mode' => 'robots',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('entity_mode');
    }
}
