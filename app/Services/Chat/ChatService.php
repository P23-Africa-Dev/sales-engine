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
                    ? "I'm searching for leads matching your request. Results will appear here when ready — you can stay on this page."
                    : "I'm researching your question. Results will appear here when ready — you can stay on this page.",
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
            $assistantBody = $this->freeformReply($organization, $icp, $session, $body, $user, $clientTimezone);
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
        if (! $this->glm->isConfigured()) {
            return $count > 0
                ? "Found {$count} qualified leads matching ICP \"{$icp->name}\" for: {$query}."
                : "No leads met the match threshold for ICP \"{$icp->name}\". Try refining territories or industries.";
        }

        try {
            return $this->glm->chat([
                ['role' => 'system', 'content' => 'You are Sales Engine. Summarize ranked lead prospects for a sales team. Use sequential numbering (1, 2, 3...) — never repeat "1." for every item. Use each lead\'s actual name field — never substitute the ICP profile name as a lead name. Emphasize match quality, score, and recommended next actions. Tell the user they can review cards below and save selected leads to CRM. ' . TimeGreeting::promptContext($clientTimezone)],
                ['role' => 'user', 'content' => json_encode([
                    'intent' => $intent,
                    'icp' => $icp->name,
                    'query' => $query,
                    'leads' => $leads,
                ], JSON_UNESCAPED_UNICODE)],
            ], 'chat', $organization);
        } catch (\Throwable) {
            return "Found {$count} qualified leads for \"{$icp->name}\".";
        }
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
            'content' => implode(' ', array_filter([
                'You are Sales Engine, a B2B lead discovery assistant for African markets.',
                'Active ICP: ' . ($icp?->name ?? 'none') . '.',
                TimeGreeting::promptContext($clientTimezone),
                $firstName !== '' ? "User's first name: {$firstName}. Use it naturally when greeting." : null,
                'When the user greets you (hello, hi, etc.), reply with the appropriate time-of-day greeting above — never the wrong period.',
            ])),
        ]);

        try {
            return $this->glm->chat($history, 'chat', $organization);
        } catch (\Throwable $e) {
            return 'Chat temporarily unavailable: ' . $e->getMessage();
        }
    }
}
