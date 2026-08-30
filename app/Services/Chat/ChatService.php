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
use InvalidArgumentException;

class ChatService
{
    public const INTENTS = ['freeform', 'quick_research', 'generate_leads', 'create_outreach'];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryOrchestrator $discovery,
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

    /**
     * @return array{user_message: ChatMessage, assistant_message: ChatMessage, discovery_run_id?: int|null}
     */
    public function postMessage(
        ChatSession $session,
        Organization $organization,
        User $user,
        string $body,
        string $intent = 'freeform',
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

        if (in_array($intent, ['quick_research', 'generate_leads'], true) && $icp) {
            $result = $this->discovery->run(
                $organization,
                $icp,
                $user,
                $body,
                $intent,
                $session->id,
            );
            $leads = $result['leads'];
            $discoveryRunId = $result['run']->id;
            $meta['discovery_run_id'] = $discoveryRunId;
            $assistantBody = $this->narrateDiscovery($organization, $icp, $body, $leads, $intent);
        } elseif ($intent === 'create_outreach' && $icp) {
            $draft = $this->outreach->draftFromPrompt($organization, $icp, $body);
            $assistantBody = $draft['body'];
            $meta['outreach'] = $draft;
            $leads = $draft['leads'] ?? [];
        } else {
            $assistantBody = $this->freeformReply($organization, $icp, $session, $body);
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

        return [
            'user_message' => $userMessage,
            'assistant_message' => $assistantMessage,
            'discovery_run_id' => $discoveryRunId,
        ];
    }

    private function narrateDiscovery(Organization $organization, IcpProfile $icp, string $query, array $leads, string $intent): string
    {
        $count = count($leads);
        if (! $this->glm->isConfigured()) {
            return $count > 0
                ? "Found {$count} leads matching ICP \"{$icp->name}\" for: {$query}."
                : "No leads found yet for ICP \"{$icp->name}\". Try refining territories or industries.";
        }

        try {
            return $this->glm->chat([
                ['role' => 'system', 'content' => 'You are Sales Engine. Summarize discovery results briefly for a sales team. Mention ICP name and top leads.'],
                ['role' => 'user', 'content' => json_encode([
                    'intent' => $intent,
                    'icp' => $icp->name,
                    'query' => $query,
                    'leads' => $leads,
                ], JSON_UNESCAPED_UNICODE)],
            ], 'chat', $organization);
        } catch (\Throwable) {
            return "Found {$count} leads for \"{$icp->name}\".";
        }
    }

    private function freeformReply(Organization $organization, ?IcpProfile $icp, ChatSession $session, string $body): string
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

        array_unshift($history, [
            'role' => 'system',
            'content' => 'You are Sales Engine, a B2B lead discovery assistant for African markets. Active ICP: '.($icp?->name ?? 'none').'.',
        ]);

        try {
            return $this->glm->chat($history, 'chat', $organization);
        } catch (\Throwable $e) {
            return 'Chat temporarily unavailable: '.$e->getMessage();
        }
    }
}
