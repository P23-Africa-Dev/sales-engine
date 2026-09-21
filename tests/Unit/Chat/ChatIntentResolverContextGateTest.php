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

    public function test_generic_generate_leads_skips_contextualize_even_with_history(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'Tell me about shipping to emerging markets',
            'intent' => 'quick_research',
        ]);

        $memory = Mockery::mock(ConversationMemoryService::class);
        $memory->shouldReceive('contextualize')->never();
        $memory->shouldReceive('recentTurns')->andReturn([
            ['role' => 'user', 'content' => 'Tell me about shipping to emerging markets'],
        ]);

        $resolver = new ChatIntentResolver($memory);
        $result = $resolver->resolve($session, 'give me prospects', 'generate_leads', $org);

        $this->assertSame('give me prospects', $result['effective_body']);
        $this->assertTrue($resolver->isGenericLeadBody('give me prospects'));
    }

    public function test_vague_further_my_need_generate_skips_contextualize(): void
    {
        [$user, $org] = $this->createUserWithOrg();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);
        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'Tell me about shipping to emerging markets',
            'intent' => 'quick_research',
        ]);

        $memory = Mockery::mock(ConversationMemoryService::class);
        $memory->shouldReceive('contextualize')->never();
        $memory->shouldReceive('recentTurns')->andReturn([
            ['role' => 'user', 'content' => 'Tell me about shipping to emerging markets'],
        ]);

        $resolver = new ChatIntentResolver($memory);
        $body = 'Generate me 10 prospect that can further my need';
        $result = $resolver->resolve($session, $body, 'generate_leads', $org);

        $this->assertSame($body, $result['effective_body']);
        $this->assertTrue($resolver->isGenericLeadBody($body));
    }
}
