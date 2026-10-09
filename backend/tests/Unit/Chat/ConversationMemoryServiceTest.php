<?php

namespace Tests\Unit\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Services\Chat\ConversationMemoryService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ConversationMemoryServiceTest extends TestCase
{
    public function test_recent_turns_excludes_pending_and_message_id(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'First question about FinTech in Lagos',
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Here is context on FinTech.',
        ]);
        $pending = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Searching...',
            'meta' => ['pending' => true],
        ]);
        $latest = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'What do you think about this?',
        ]);

        $turns = app(ConversationMemoryService::class)->recentTurns($session, 10, $latest->id);

        $this->assertCount(2, $turns);
        $this->assertSame('user', $turns[0]['role']);
        $this->assertStringContainsString('FinTech in Lagos', $turns[0]['content']);
        $this->assertSame('assistant', $turns[1]['role']);
        $bodies = collect($turns)->pluck('content')->all();
        $this->assertFalse(collect($bodies)->contains(fn($b) => str_contains((string) $b, 'Searching')));
        $this->assertFalse(collect($bodies)->contains(fn($b) => str_contains((string) $b, 'What do you think')));
        $this->assertNotNull($pending->id);
    }

    public function test_contextualize_uses_heuristic_fallback_without_glm(): void
    {
        config(['services.glm.api_key' => '']);

        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Prospects include Acme Logistics and Bloom Pharma.',
        ]);

        $result = app(ConversationMemoryService::class)->contextualize(
            $session,
            'Create leads for all of these',
            $org,
        );

        $this->assertTrue($result['used_context']);
        $this->assertStringContainsString('Context from prior assistant response', $result['effective_query']);
        $this->assertStringContainsString('Acme Logistics', $result['effective_query']);
        $this->assertStringContainsString('Create leads for all of these', $result['effective_query']);
    }

    public function test_contextualize_skips_when_message_is_self_contained(): void
    {
        config(['services.glm.api_key' => '']);

        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Earlier answer about something unrelated.',
        ]);

        $query = 'Find FMCG distributors in Lagos Nigeria for wholesale distribution partnerships in 2026';
        $result = app(ConversationMemoryService::class)->contextualize($session, $query, $org);

        $this->assertFalse($result['used_context']);
        $this->assertSame($query, $result['effective_query']);
    }

    public function test_summary_refresh_when_trigger_exceeded(): void
    {
        config([
            'services.glm.api_key' => 'test-glm',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.chat.history_window' => 4,
            'services.chat.summary_trigger' => 5,
        ]);

        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        for ($i = 1; $i <= 8; $i++) {
            ChatMessage::query()->create([
                'chat_session_id' => $session->id,
                'role' => $i % 2 === 1 ? 'user' : 'assistant',
                'body' => "Turn {$i} about logistics partnerships in West Africa.",
            ]);
        }

        Http::fake([
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '- User is focused on logistics partnerships in West Africa.',
                    ],
                ]],
            ], 200),
        ]);

        $summary = app(ConversationMemoryService::class)->getOrRefreshSummary($session, $org);

        $this->assertNotNull($summary);
        $this->assertStringContainsString('logistics', mb_strtolower((string) $summary));
        $this->assertNotNull($session->fresh()->context_summary);
        $this->assertNotNull($session->fresh()->context_summary_through_message_id);
    }
}
