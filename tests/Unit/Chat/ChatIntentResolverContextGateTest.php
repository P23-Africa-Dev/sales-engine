<?php

namespace Tests\Unit\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Services\Chat\ChatIntentResolver;
use App\Services\Chat\ConversationMemoryService;
use Mockery;
use Tests\TestCase;

class ChatIntentResolverContextGateTest extends TestCase
{
    public function test_self_contained_prompt_skips_contextualize(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        $memory = Mockery::mock(ConversationMemoryService::class);
        $memory->shouldReceive('contextualize')->never();
        $memory->shouldReceive('recentTurns')->andReturn([]);

        $resolver = new ChatIntentResolver($memory);
        $result = $resolver->resolve(
            $session,
            'Research FMCG market trends in West Africa for distributors',
            'quick_research',
            $org,
        );

        $this->assertSame('quick_research', $result['intent']);
        $this->assertSame(
            'Research FMCG market trends in West Africa for distributors',
            $result['effective_body']
        );
    }

    public function test_short_follow_up_with_history_contextualizes(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'Tell me about fintech in Lagos',
            'intent' => 'quick_research',
        ]);

        $memory = Mockery::mock(ConversationMemoryService::class);
        $memory->shouldReceive('recentTurns')->andReturn([
            ['role' => 'user', 'content' => 'Tell me about fintech in Lagos'],
        ]);
        $memory->shouldReceive('contextualize')
            ->once()
            ->andReturn(['effective_query' => 'fintech in Lagos Nigeria follow-up', 'used_context' => true]);

        $resolver = new ChatIntentResolver($memory);
        $result = $resolver->resolve($session, 'and Nigeria?', 'quick_research', $org);

        $this->assertSame('fintech in Lagos Nigeria follow-up', $result['effective_body']);
    }

    public function test_needs_conversation_context_detects_pronouns_only_with_history(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        $memory = Mockery::mock(ConversationMemoryService::class);
        $memory->shouldReceive('recentTurns')->andReturn([]);

        $resolver = new ChatIntentResolver($memory);
        $this->assertFalse($resolver->needsConversationContext($session, 'expand on that market'));
    }
}
