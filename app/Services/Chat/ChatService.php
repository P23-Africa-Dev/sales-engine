<?php

namespace App\Services\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Icp\IcpProfileService;
use App\Services\Llm\GlmClient;
use App\Services\Outreach\OutreachDraftService;
use App\Services\Research\ResearchOrchestrator;
use App\Support\TimeGreeting;
use InvalidArgumentException;

class ChatService
{
    public const INTENTS = ['freeform', 'quick_research', 'generate_leads', 'create_outreach'];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryOrchestrator $discovery,
        private readonly ResearchOrchestrator $research,
        private readonly IcpProfileService $icps,
        private readonly OutreachDraftService $outreach,
    ) {}

    public function createSession(Organization $organization, User $user, ?string $title = null): ChatSession
    {
        $icp = $this->icps->active($organization);

        return ChatSession::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp?->id,
            'title' => $title,
        ]);
    }

    public function latestSessionForUser(Organization $organization, User $user): ?ChatSession
    {
        return ChatSession::query()
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->whereHas('messages')
            ->latest('updated_at')
            ->first();
    }

    /**
     * @return array{user_message: ChatMessage, assistant_message: ChatMessage, discovery_run_id?: int|null}
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
            $result = $this->discovery->run(
                $organization,
                $icp,
                $user,
                $body,
                $intent,
                $session->id,
                12,
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
        ];
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
                ['role' => 'system', 'content' => 'You are Sales Engine. Summarize ranked lead prospects for a sales team. Emphasize match quality, score, and recommended next actions. Mention ICP name and top leads. '.TimeGreeting::promptContext($clientTimezone)],
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
            ->map(fn (ChatMessage $m) => ['role' => $m->role, 'content' => $m->body])
            ->all();

        $history[] = ['role' => 'user', 'content' => $body];

        $firstName = trim(explode(' ', trim($user->name ?? ''), 2)[0] ?? '');

        array_unshift($history, [
            'role' => 'system',
            'content' => implode(' ', array_filter([
                'You are Sales Engine, a B2B lead discovery assistant for African markets.',
                'Active ICP: '.($icp?->name ?? 'none').'.',
                TimeGreeting::promptContext($clientTimezone),
                $firstName !== '' ? "User's first name: {$firstName}. Use it naturally when greeting." : null,
                'When the user greets you (hello, hi, etc.), reply with the appropriate time-of-day greeting above — never the wrong period.',
            ])),
        ]);

        try {
            return $this->glm->chat($history, 'chat', $organization);
        } catch (\Throwable $e) {
            return 'Chat temporarily unavailable: '.$e->getMessage();
        }
    }
}
