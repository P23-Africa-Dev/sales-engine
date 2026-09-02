<?php

namespace Tests\Unit;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Services\Chat\ChatIntentResolver;
use Tests\TestCase;

class ChatIntentResolverTest extends TestCase
{
    private ChatIntentResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new ChatIntentResolver;
    }

    public function test_upgrades_freeform_create_leads_message(): void
    {
        $result = $this->resolver->resolve(
            $this->makeSession(),
            'create leads for the top 10 wealthiest men',
            'freeform',
        );

        $this->assertSame('generate_leads', $result['intent']);
        $this->assertStringContainsString('top 10 wealthiest men', $result['body']);
    }

    public function test_keeps_explicit_generate_leads_intent(): void
    {
        $result = $this->resolver->resolve(
            $this->makeSession(),
            'Top FMCG distributors in Lagos',
            'generate_leads',
        );

        $this->assertSame('generate_leads', $result['intent']);
        $this->assertSame('Top FMCG distributors in Lagos', $result['body']);
    }

    public function test_keeps_unrelated_freeform_message(): void
    {
        $result = $this->resolver->resolve(
            $this->makeSession(),
            'What is FMCG?',
            'freeform',
        );

        $this->assertSame('freeform', $result['intent']);
    }

    public function test_expands_query_with_prior_assistant_context(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Here are the top 10 wealthiest executives in tech.',
        ]);

        $result = $this->resolver->resolve(
            $session,
            'Create a lead for all of these top 10',
            'freeform',
        );

        $this->assertSame('generate_leads', $result['intent']);
        $this->assertStringContainsString('Context from prior assistant response', $result['body']);
        $this->assertStringContainsString('wealthiest executives', $result['body']);
    }

    private function makeSession(): ChatSession
    {
        [$user, $org] = $this->actingAsOrgMember();

        return ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);
    }
}
