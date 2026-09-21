<?php

namespace Tests\Feature;

use App\Jobs\ProcessChatIntentJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Lead;
use Illuminate\Queue\TimeoutExceededException;
use Tests\TestCase;

class ProcessChatIntentJobRecoveryTest extends TestCase
{
    public function test_timeout_failure_recovers_leads_and_completes_run(): void
    {
        [$user, $org] = $this->createUserWithOrg();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'title' => 'Generate',
        ]);

        $run = DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'running',
            'query' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'stages' => ['extracting'],
            'started_at' => now()->subMinutes(2),
        ]);

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'meta' => ['intent' => 'generate_leads'],
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Searching…',
            'intent' => 'generate_leads',
            'meta' => [
                'pending' => true,
                'discovery_run_id' => $run->id,
            ],
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'user_id' => $user->id,
            'name' => 'Ada Lovelace',
            'source' => 'serper',
            'score' => 88,
            'summary' => 'Fintech founder',
            'save_status' => 'pending',
            'meta' => [
                'title' => 'CEO',
                'company' => 'Analytical Engines',
            ],
        ]);

        $job = new ProcessChatIntentJob($run->id, $userMessage->id);
        $job->failed(new TimeoutExceededException('ProcessChatIntentJob has timed out.'));

        $run->refresh();
        $this->assertSame('completed', $run->status);
        $this->assertNull($run->error);
        $this->assertSame(1, (int) ($run->result_summary['lead_count'] ?? 0));

        $assistant = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($assistant);
        $this->assertFalse((bool) ($assistant->meta['pending'] ?? true));
        $this->assertSame(1, is_array($assistant->leads) ? count($assistant->leads) : 0);
        $this->assertStringContainsString('prospect', mb_strtolower($assistant->body));
        $this->assertStringNotContainsString('timed out or was interrupted', $assistant->body);
    }

    public function test_generate_leads_without_icp_returns_explicit_422_message(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => null,
            'title' => 'No ICP',
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'find leads',
                'intent' => 'generate_leads',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'An active ICP profile is required for this intent.');
    }

    public function test_successful_completion_overwrites_premature_timeout_placeholder(): void
    {
        [$user, $org] = $this->createUserWithOrg();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
        ]);

        $run = DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'queued',
            'query' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'stages' => ['analyzing_brief'],
            'error' => 'App\Jobs\ProcessChatIntentJob has been attempted too many times.',
        ]);

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'meta' => ['intent' => 'generate_leads', 'effective_query' => 'fintech CEOs'],
        ]);

        $timeoutMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Lead search timed out or was interrupted. Please try again. Results usually appear within a couple of minutes.',
            'intent' => 'generate_leads',
            'meta' => [
                'pending' => false,
                'discovery_run_id' => $run->id,
                'timed_out' => true,
            ],
        ]);

        $discovery = \Mockery::mock(\App\Services\Discovery\DiscoveryOrchestrator::class);
        $discovery->shouldReceive('run')->once()->andReturnUsing(function () use ($run) {
            $run->refresh()->update([
                'status' => 'completed',
                'error' => null,
                'result_summary' => ['lead_count' => 1],
                'finished_at' => now(),
            ]);

            return [
                'run' => $run->fresh(),
                'leads' => [[
                    'id' => 1,
                    'name' => 'Ada Lovelace',
                    'source' => 'serper',
                    'score' => 90,
                    'summary' => 'CEO',
                    'title' => 'CEO',
                    'company' => 'Analytical Engines',
                ]],
                'companies' => collect(),
            ];
        });
        $this->app->instance(\App\Services\Discovery\DiscoveryOrchestrator::class, $discovery);
        $this->app->forgetInstance(\App\Services\Chat\ChatService::class);

        app(\App\Services\Chat\ChatService::class)->processQueuedIntent($run->id, $userMessage->id);

        $this->assertSame(1, ChatMessage::query()->where('chat_session_id', $session->id)->where('role', 'assistant')->count());

        $timeoutMessage->refresh();
        $this->assertStringContainsString('Ada Lovelace', $timeoutMessage->body);
        $this->assertSame(1, is_array($timeoutMessage->leads) ? count($timeoutMessage->leads) : 0);
        $this->assertFalse((bool) ($timeoutMessage->meta['pending'] ?? true));

        $run->refresh();
        $this->assertSame('completed', $run->status);
        $this->assertNull($run->error);
    }

    public function test_max_attempts_while_run_active_is_ignored(): void
    {
        [$user, $org] = $this->createUserWithOrg();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'title' => 'Generate',
        ]);

        $run = DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'running',
            'query' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'stages' => ['searching_sources'],
            'started_at' => now()->subSeconds(30),
        ]);

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'meta' => ['intent' => 'generate_leads'],
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Searching…',
            'intent' => 'generate_leads',
            'meta' => [
                'pending' => true,
                'discovery_run_id' => $run->id,
            ],
        ]);

        $job = new ProcessChatIntentJob($run->id, $userMessage->id);
        $job->failed(new \RuntimeException('App\Jobs\ProcessChatIntentJob has been attempted too many times.'));

        $run->refresh();
        $this->assertSame('running', $run->status);
        $this->assertNull($run->error);

        $assistant = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($assistant);
        $this->assertTrue((bool) ($assistant->meta['pending'] ?? false));
        $this->assertSame('Searching…', $assistant->body);
    }

    public function test_soft_timeout_keeps_pending_awaiting_user_choice(): void
    {
        [$user, $org] = $this->createUserWithOrg();

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'title' => 'Generate',
        ]);

        $run = DiscoveryRun::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $session->id,
            'status' => 'running',
            'query' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'stages' => ['extracting'],
            'started_at' => now()->subMinutes(12),
        ]);

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => 'fintech CEOs',
            'intent' => 'generate_leads',
            'meta' => ['intent' => 'generate_leads'],
        ]);

        ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Searching…',
            'intent' => 'generate_leads',
            'meta' => [
                'pending' => true,
                'discovery_run_id' => $run->id,
            ],
        ]);

        $job = new ProcessChatIntentJob($run->id, $userMessage->id);
        $job->failed(new TimeoutExceededException('ProcessChatIntentJob has timed out.'));

        $run->refresh();
        $this->assertSame('failed', $run->status);

        $assistant = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->orderByDesc('id')
            ->first();

        $this->assertNotNull($assistant);
        $this->assertTrue((bool) ($assistant->meta['pending'] ?? false));
        $this->assertTrue((bool) ($assistant->meta['awaiting_user_choice'] ?? false));
        $this->assertStringContainsString('keep waiting', mb_strtolower($assistant->body));
    }
}
