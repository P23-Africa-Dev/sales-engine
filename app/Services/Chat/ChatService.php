<?php

namespace App\Services\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Icp\IcpProfileService;
use App\Services\Llm\GlmClient;
use App\Services\Outreach\OutreachDraftService;
use App\Services\Research\ResearchOrchestrator;
use App\Support\TimeGreeting;
use App\Jobs\ProcessChatIntentJob;
use InvalidArgumentException;

class ChatService
{
    public const INTENTS = ['freeform', 'quick_research', 'generate_leads', 'create_outreach'];

    public const ASYNC_INTENTS = ['quick_research', 'generate_leads'];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryOrchestrator $discovery,
        private readonly ResearchOrchestrator $research,
        private readonly IcpProfileService $icps,
        private readonly OutreachDraftService $outreach,
        private readonly ChatIntentResolver $intentResolver,
        private readonly IcpChatContextBuilder $icpChatContext,
    ) {}

    public function createSession(Organization $organization, User $user, ?string $title = null, ?int $icpProfileId = null): ChatSession
    {
        $icpId = $icpProfileId ?? $this->icps->active($organization)?->id;

        return ChatSession::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icpId,
            'title' => $title,
        ]);
    }

    public function latestSessionForUser(Organization $organization, User $user, ?int $icpProfileId = null): ?ChatSession
    {
        $resolvedIcpId = $icpProfileId ?? $this->icps->active($organization)?->id;

        $query = ChatSession::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id);

        if ($resolvedIcpId) {
            $query->where('icp_profile_id', $resolvedIcpId);
        }

        return $query
            ->whereHas('messages')
            ->latest('updated_at')
            ->first();
    }

    public function resolveOrCreateSessionForIcp(Organization $organization, User $user, IcpProfile $icp): ChatSession
    {
        $existing = ChatSession::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->where('icp_profile_id', $icp->id)
            ->latest('updated_at')
            ->first();

        if ($existing) {
            return $existing;
        }

        return $this->createSession($organization, $user, null, $icp->id);
    }

    public function clearSessionMessages(ChatSession $session): void
    {
        ChatMessage::query()->where('chat_session_id', $session->id)->delete();
        $session->touch();
    }

    /**
     * @return array{user_message: ChatMessage, assistant_message?: ChatMessage|null, discovery_run_id?: int|null, status?: string}
     */
    public function postMessage(
        ChatSession $session,
        Organization $organization,
        User $user,
        string $body,
        string $intent = 'freeform',
        ?string $clientTimezone = null,
    ): array {
        if (! in_array($intent, self::INTENTS, true)) {
            throw new InvalidArgumentException('Invalid intent.');
        }

        ['intent' => $intent, 'body' => $body] = $this->intentResolver->resolve($session, $body, $intent);

        $icp = $session->icp_profile_id
            ? IcpProfile::query()->where('organization_id', $organization->id)->find($session->icp_profile_id)
            : $this->icps->active($organization);

        if (! $icp && in_array($intent, ['quick_research', 'generate_leads', 'create_outreach'], true)) {
            throw new InvalidArgumentException('An active ICP profile is required for this intent.');
        }

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => $body,
            'intent' => $intent,
        ]);

        if (in_array($intent, self::ASYNC_INTENTS, true) && $icp) {
            $run = DiscoveryRun::query()->create([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'icp_profile_id' => $icp->id,
                'chat_session_id' => $session->id,
                'status' => 'queued',
                'query' => $body,
                'intent' => $intent,
                'stages' => ['analyzing_brief'],
            ]);

            ChatMessage::query()->create([
                'chat_session_id' => $session->id,
                'role' => 'assistant',
                'body' => $intent === 'generate_leads'
                    ? "Searching for leads matching your request. Results will appear here shortly."
                    : "Researching your question. Results will appear here shortly.",
                'intent' => $intent,
                'meta' => [
                    'pending' => true,
                    'discovery_run_id' => $run->id,
                ],
            ]);

            ProcessChatIntentJob::dispatch(
                $run->id,
                $userMessage->id,
                $clientTimezone,
            );

            if (! $session->title) {
                $session->update(['title' => mb_substr($body, 0, 80)]);
            }
            $session->touch();

            if (config('queue.default') === 'sync') {
                $assistantMessage = ChatMessage::query()
                    ->where('chat_session_id', $session->id)
                    ->where('role', 'assistant')
                    ->where('id', '>', $userMessage->id)
                    ->orderByDesc('id')
                    ->get()
                    ->first(fn(ChatMessage $message) => ! ($message->meta['pending'] ?? false))
                    ?? ChatMessage::query()
                    ->where('chat_session_id', $session->id)
                    ->where('role', 'assistant')
                    ->where('id', '>', $userMessage->id)
                    ->orderByDesc('id')
                    ->first();

                return [
                    'user_message' => $userMessage,
                    'assistant_message' => $assistantMessage,
                    'discovery_run_id' => $run->id,
                    'status' => $assistantMessage ? 'completed' : 'processing',
                ];
            }

            return [
                'user_message' => $userMessage,
                'assistant_message' => null,
                'discovery_run_id' => $run->id,
                'status' => 'processing',
            ];
        }

        $leads = [];
        $meta = ['intent' => $intent];
        $discoveryRunId = null;

        if ($intent === 'quick_research' && $icp) {
            $result = $this->research->run(
                $organization,
                $icp,
                $user,
                $body,
                $session->id,
            );
            $discoveryRunId = $result['run']->id;
            $meta['discovery_run_id'] = $discoveryRunId;
            $meta['research'] = $result['research'];
            $assistantBody = $result['narrative'];
        } elseif ($intent === 'generate_leads' && $icp) {
            $brief = IcpBrief::fromIcpProfile($icp, $body);
            $result = $this->discovery->run(
                $organization,
                $icp,
                $user,
                $body,
                $intent,
                $session->id,
                $brief->requestedLimit,
            );
            $leads = $result['leads'];
            $discoveryRunId = $result['run']->id;
            $meta['discovery_run_id'] = $discoveryRunId;
            $assistantBody = $this->narrateDiscovery($organization, $icp, $body, $leads, $intent, $clientTimezone);
        } elseif ($intent === 'create_outreach' && $icp) {
            $draft = $this->outreach->draftFromPrompt($organization, $icp, $body, $clientTimezone, $session->id);
            $assistantBody = $draft['body'];
            $meta['outreach'] = $draft;
            $leads = $draft['leads'] ?? [];
        } else {
            // Freeform always follows the org's currently active ICP (may differ from session-bound profile).
            $activeIcp = $this->icps->active($organization) ?? $icp;
            $assistantBody = $this->freeformReply($organization, $activeIcp, $session, $body, $user, $clientTimezone);
        }

        $assistantMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => $assistantBody,
            'intent' => $intent,
            'leads' => $leads ?: null,
            'meta' => $meta,
        ]);

        if (! $session->title) {
            $session->update(['title' => mb_substr($body, 0, 80)]);
        }

        $session->touch();

        return [
            'user_message' => $userMessage,
            'assistant_message' => $assistantMessage,
            'discovery_run_id' => $discoveryRunId,
            'status' => 'completed',
        ];
    }

    public function processQueuedIntent(int $runId, int $userMessageId, ?string $clientTimezone = null): void
    {
        $run = DiscoveryRun::query()->find($runId);
        if (! $run || $run->status !== 'queued') {
            return;
        }

        $session = $run->chat_session_id
            ? ChatSession::query()->find($run->chat_session_id)
            : null;
        $userMessage = ChatMessage::query()->find($userMessageId);

        if (! $session || ! $userMessage || $userMessage->chat_session_id !== $session->id) {
            $run->update(['status' => 'failed', 'error' => 'Invalid chat context.', 'finished_at' => now()]);

            return;
        }

        $organization = Organization::query()->find($run->organization_id);
        $user = User::query()->find($run->user_id);
        $icp = $run->icp_profile_id
            ? IcpProfile::query()->find($run->icp_profile_id)
            : null;

        if (! $organization || ! $user || ! $icp) {
            $run->update(['status' => 'failed', 'error' => 'Missing organization, user, or ICP.', 'finished_at' => now()]);

            return;
        }

        $body = $userMessage->body;
        $intent = (string) $run->intent;
        $leads = [];
        $meta = ['intent' => $intent, 'discovery_run_id' => $run->id];

        try {
            if ($intent === 'quick_research') {
                $result = $this->research->run(
                    $organization,
                    $icp,
                    $user,
                    $body,
                    $session->id,
                    $run,
                );
                $meta['research'] = $result['research'];
                $assistantBody = $result['narrative'];
            } elseif ($intent === 'generate_leads') {
                $brief = IcpBrief::fromIcpProfile($icp, $body);
                $result = $this->discovery->run(
                    $organization,
                    $icp,
                    $user,
                    $body,
                    $intent,
                    $session->id,
                    $brief->requestedLimit,
                    $run,
                );
                $leads = $result['leads'];
                $assistantBody = $this->narrateDiscovery($organization, $icp, $body, $leads, $intent, $clientTimezone);
            } else {
                $run->update(['status' => 'failed', 'error' => 'Unsupported async intent.', 'finished_at' => now()]);

                return;
            }

            $placeholder = ChatMessage::query()
                ->where('chat_session_id', $session->id)
                ->where('role', 'assistant')
                ->where('id', '>', $userMessage->id)
                ->orderBy('id')
                ->get()
                ->first(fn(ChatMessage $message) => (bool) ($message->meta['pending'] ?? false));

            if ($placeholder) {
                $placeholder->update([
                    'body' => $assistantBody,
                    'intent' => $intent,
                    'leads' => $leads ?: null,
                    'meta' => $meta,
                ]);
            } else {
                ChatMessage::query()->create([
                    'chat_session_id' => $session->id,
                    'role' => 'assistant',
                    'body' => $assistantBody,
                    'intent' => $intent,
                    'leads' => $leads ?: null,
                    'meta' => $meta,
                ]);
            }

            $session->touch();
        } catch (\Throwable $e) {
            $placeholder = ChatMessage::query()
                ->where('chat_session_id', $session->id)
                ->where('role', 'assistant')
                ->where('id', '>', $userMessage->id)
                ->orderBy('id')
                ->get()
                ->first(fn(ChatMessage $message) => (bool) ($message->meta['pending'] ?? false));

            if ($placeholder) {
                $placeholder->update([
                    'body' => 'Sorry, that request failed: ' . $e->getMessage(),
                    'intent' => $intent,
                    'meta' => array_merge($meta, ['error' => $e->getMessage(), 'pending' => false]),
                ]);
            } else {
                ChatMessage::query()->create([
                    'chat_session_id' => $session->id,
                    'role' => 'assistant',
                    'body' => 'Sorry, that request failed: ' . $e->getMessage(),
                    'intent' => $intent,
                    'meta' => array_merge($meta, ['error' => $e->getMessage()]),
                ]);
            }
            $session->touch();
        }
    }

    private function narrateDiscovery(Organization $organization, IcpProfile $icp, string $query, array $leads, string $intent, ?string $clientTimezone = null): string
    {
        $count = count($leads);
        $hasUserQuery = trim($query) !== '';

        if ($count === 0) {
            if ($hasUserQuery) {
                return 'No leads could be extracted for your search. Try rephrasing your request or asking for specific names, companies, or territories.';
            }

            return "No leads met the match threshold for ICP \"{$icp->name}\". Try refining territories or industries.";
        }

        $icpRecommendedCount = count(array_filter($leads, fn(array $lead) => (bool) ($lead['icp_recommended'] ?? false)));
        $advisoryNote = $this->buildIcpAdvisoryNote($icp, $count, $icpRecommendedCount, $hasUserQuery);

        if (! $this->glm->isConfigured()) {
            return "Found {$count} leads for your search.{$advisoryNote}";
        }

        try {
            $publicLeads = array_map(fn(array $lead) => array_filter([
                'name' => $lead['name'] ?? '',
                'score' => $lead['score'] ?? 0,
                'summary' => $lead['summary'] ?? '',
                'title' => $lead['title'] ?? null,
                'company' => $lead['company'] ?? null,
                'icp_recommended' => (bool) ($lead['icp_recommended'] ?? false),
            ]), $leads);

            $narrative = $this->glm->chat([
                ['role' => 'system', 'content' => 'You are Sales Engine. Summarize ranked lead prospects for a sales team. Use sequential numbering (1, 2, 3...) — never repeat "1." for every item. Use each lead\'s actual name field — never substitute the ICP profile name as a lead name. Write in plain prose: name, role/company if known, and why they matter for the active ICP. Do NOT include internal fields like Match Quality, Query Match, ICP Fit Score, or Recommended Next Action. Tell the user they can review cards below and save selected leads to CRM. When some leads are outside the user\'s ICP, mention that clearly but still present all results. ' . TimeGreeting::promptContext($clientTimezone)],
                ['role' => 'user', 'content' => json_encode([
                    'intent' => $intent,
                    'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                    'query' => $query,
                    'leads' => $publicLeads,
                    'icp_recommended_count' => $icpRecommendedCount,
                ], JSON_UNESCAPED_UNICODE)],
            ], 'chat', $organization);

            return rtrim($this->fixRepeatedNumbering($narrative)) . $advisoryNote;
        } catch (\Throwable) {
            return "Found {$count} leads for your search.{$advisoryNote}";
        }
    }

    private function buildIcpAdvisoryNote(IcpProfile $icp, int $total, int $icpRecommendedCount, bool $hasUserQuery): string
    {
        if (! $hasUserQuery || $total === 0) {
            return '';
        }

        if ($icpRecommendedCount === $total) {
            return " All {$total} match your ICP \"{$icp->name}\".";
        }

        if ($icpRecommendedCount === 0) {
            return " These answer your search but may fall outside your ICP ({$icp->name}). Review cards below and save any you want. Consider refining your ICP or asking for ICP-aligned alternatives.";
        }

        $outside = $total - $icpRecommendedCount;

        return " {$icpRecommendedCount} of {$total} align with your ICP \"{$icp->name}\"; {$outside} answer your search but may be outside your profile. Save any leads you want from the cards below.";
    }

    private function fixRepeatedNumbering(string $text): string
    {
        $counter = 0;

        return preg_replace_callback('/^\s*1\.\s+/m', function () use (&$counter): string {
            $counter++;

            return " {$counter}. ";
        }, $text) ?? $text;
    }

    private function freeformReply(Organization $organization, ?IcpProfile $icp, ChatSession $session, string $body, User $user, ?string $clientTimezone = null): string
    {
        if (! $this->glm->isConfigured()) {
            return 'Sales Engine is ready. Configure GLM_API_KEY for full chat, or use generate_leads / quick_research intents once Serper (and optional registries) are keyed.';
        }

        $history = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->orderBy('id')
            ->limit(12)
            ->get()
            ->map(fn(ChatMessage $m) => ['role' => $m->role, 'content' => $m->body])
            ->all();

        $history[] = ['role' => 'user', 'content' => $body];

        $firstName = trim(explode(' ', trim($user->name ?? ''), 2)[0] ?? '');

        array_unshift($history, [
            'role' => 'system',
            'content' => $this->icpChatContext->buildFreeformSystemPrompt($icp, $firstName, $clientTimezone),
        ]);

        try {
            return $this->glm->chat($history, 'chat', $organization);
        } catch (\Throwable $e) {
            return 'Chat temporarily unavailable: ' . $e->getMessage();
        }
    }
}
