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
use App\Services\Discovery\QueryIntentService;
use App\Services\Icp\IcpProfileService;
use App\Services\Llm\GlmClient;
use App\Services\Outreach\OutreachDraftService;
use App\Services\Research\ResearchOrchestrator;
use App\Support\TimeGreeting;
use App\Jobs\ProcessChatIntentJob;
use App\Jobs\ProcessQuickResearchJob;
use InvalidArgumentException;

class ChatService
{
    public const INTENTS = ['freeform', 'quick_research', 'generate_leads', 'generate_more_leads', 'create_outreach'];

    public const ASYNC_INTENTS = ['quick_research', 'generate_leads', 'generate_more_leads'];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryOrchestrator $discovery,
        private readonly ResearchOrchestrator $research,
        private readonly IcpProfileService $icps,
        private readonly OutreachDraftService $outreach,
        private readonly ChatIntentResolver $intentResolver,
        private readonly IcpChatContextBuilder $icpChatContext,
        private readonly ValueSeekingQueryDetector $valueSeeking,
        private readonly FreeformOpportunityRetriever $opportunityRetriever,
        private readonly ChatListNumbering $listNumbering,
        private readonly ConversationMemoryService $memory,
        private readonly \App\Services\Discovery\LeadQueryNormalizer $leadQueryNormalizer,
        private readonly QueryIntentService $queryIntent = new QueryIntentService,
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
        $session->update([
            'context_summary' => null,
            'context_summary_through_message_id' => null,
        ]);
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

        ['intent' => $intent, 'body' => $body, 'effective_body' => $effectiveBody] = $this->intentResolver->resolve(
            $session,
            $body,
            $intent,
            $organization,
        );

        $icp = $session->icp_profile_id
            ? IcpProfile::query()->where('organization_id', $organization->id)->find($session->icp_profile_id)
            : $this->icps->active($organization);

        if (! $icp && in_array($intent, ['quick_research', 'generate_leads', 'generate_more_leads', 'create_outreach'], true)) {
            throw new InvalidArgumentException('An active ICP profile is required for this intent.');
        }

        $queryNormalized = false;
        $originalQuery = $effectiveBody;
        $icpSearchBrief = false;
        $searchQueryOverride = null;
        $briefUserQuery = $effectiveBody;

        if (in_array($intent, ['generate_leads', 'generate_more_leads'], true) && $icp) {
            $excludeLeadNames = [];
            if ($intent === 'generate_more_leads') {
                $excludeLeadNames = $this->recentLeadNamesFromSession($session);
            }

            $useIcpBrief = $this->intentResolver->isGenericLeadBody($body)
                || ($intent === 'generate_more_leads' && $this->recentGenerateWasIcpSearchBrief($session));

            if ($useIcpBrief) {
                $searchBrief = IcpBrief::fromIcpProfile($icp)->searchBrief();
                $originalQuery = $body;
                $effectiveBody = $searchBrief;
                $searchQueryOverride = $searchBrief;
                $briefUserQuery = $this->intentResolver->isGenericLeadBody($body)
                    ? $body
                    : 'generate leads';
                $icpSearchBrief = true;
                $queryNormalized = true;
            } else {
                $normalized = $this->leadQueryNormalizer->normalize($effectiveBody, $icp);
                if (trim($normalized) !== '' && trim($normalized) !== trim($effectiveBody)) {
                    $originalQuery = $effectiveBody;
                    $effectiveBody = $normalized;
                    $queryNormalized = true;
                }
                $briefUserQuery = $effectiveBody;

                if ($intent === 'generate_more_leads' && ($excludeLeadNames === [] || ! $queryNormalized)) {
                    $seedQuery = $this->recentGenerateQueryFromSession($session);
                    if ($seedQuery !== null && trim($seedQuery) !== '') {
                        $effectiveBody = $this->leadQueryNormalizer->normalize($seedQuery, $icp);
                        $briefUserQuery = $effectiveBody;
                        $queryNormalized = true;
                        $originalQuery = $body;
                    } elseif ($icp) {
                        $searchBrief = IcpBrief::fromIcpProfile($icp)->searchBrief();
                        $effectiveBody = $searchBrief;
                        $searchQueryOverride = $searchBrief;
                        $briefUserQuery = 'generate leads';
                        $icpSearchBrief = true;
                        $queryNormalized = true;
                        $originalQuery = $body;
                    }
                }
            }
        } else {
            $excludeLeadNames = [];
        }

        $userMeta = ['intent' => $intent];
        if (trim($effectiveBody) !== trim($body) || $queryNormalized) {
            $userMeta['effective_query'] = $effectiveBody;
            $userMeta['used_context'] = true;
        }
        if ($queryNormalized) {
            $userMeta['original_query'] = $originalQuery;
            $userMeta['query_normalized'] = true;
        }
        if ($icpSearchBrief) {
            $userMeta['icp_search_brief'] = true;
            $userMeta['effective_query'] = $effectiveBody;
            $userMeta['original_query'] = $originalQuery;
            $userMeta['brief_user_query'] = $briefUserQuery;
        }
        if ($excludeLeadNames !== []) {
            $userMeta['exclude_lead_names'] = array_values(array_slice($excludeLeadNames, 0, 200));
        }

        $userMessage = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'user',
            'body' => $body,
            'intent' => $intent,
            'meta' => $userMeta,
        ]);

        $historySlice = $this->memory->recentTurns($session, 6, $userMessage->id);

        if (in_array($intent, self::ASYNC_INTENTS, true) && $icp) {
            $run = DiscoveryRun::query()->create([
                'organization_id' => $organization->id,
                'user_id' => $user->id,
                'icp_profile_id' => $icp->id,
                'chat_session_id' => $session->id,
                'status' => 'queued',
                'query' => $effectiveBody,
                'intent' => $intent,
                'stages' => ['analyzing_brief'],
            ]);

            $pendingBody = match ($intent) {
                'generate_more_leads' => 'Finding more prospects for your ICP. Results will appear here shortly.',
                'generate_leads' => 'Searching for leads matching your request. Results will appear here shortly.',
                default => 'Researching your question. Results will appear here shortly.',
            };

            ChatMessage::query()->create([
                'chat_session_id' => $session->id,
                'role' => 'assistant',
                'body' => $pendingBody,
                'intent' => $intent,
                'meta' => [
                    'pending' => true,
                    'discovery_run_id' => $run->id,
                ],
            ]);

            if ($intent === 'quick_research') {
                ProcessQuickResearchJob::dispatch(
                    $run->id,
                    $userMessage->id,
                    $clientTimezone,
                )->onQueue('research');
            } else {
                ProcessChatIntentJob::dispatch(
                    $run->id,
                    $userMessage->id,
                    $clientTimezone,
                )->onQueue('discovery');
            }

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
                $effectiveBody,
                $session->id,
                null,
                $historySlice,
            );
            $discoveryRunId = $result['run']->id;
            $meta['discovery_run_id'] = $discoveryRunId;
            $meta['research'] = $result['research'];
            $assistantBody = $result['narrative'];
        } elseif (in_array($intent, ['generate_leads', 'generate_more_leads'], true) && $icp) {
            $brief = IcpBrief::fromIcpProfile($icp, $briefUserQuery);
            if ($searchQueryOverride !== null) {
                $brief = $brief->withSearchQueryOverride($searchQueryOverride);
            }
            $result = $this->discovery->run(
                $organization,
                $icp,
                $user,
                $briefUserQuery,
                $intent === 'generate_more_leads' ? 'generate_more_leads' : 'generate_leads',
                $session->id,
                $brief->requestedLimit,
                null,
                $excludeLeadNames,
                $intent !== 'generate_more_leads',
                $searchQueryOverride,
            );
            $leads = $result['leads'];
            $discoveryRunId = $result['run']->id;
            $meta['discovery_run_id'] = $discoveryRunId;
            if ($intent === 'generate_more_leads') {
                $meta['generate_more'] = true;
            }
            $assistantBody = $this->narrateDiscovery(
                $organization,
                $icp,
                $effectiveBody,
                $leads,
                $intent,
                $clientTimezone,
                $historySlice,
            );
        } elseif ($intent === 'create_outreach' && $icp) {
            $draft = $this->outreach->draftFromPrompt(
                $organization,
                $icp,
                $effectiveBody,
                $clientTimezone,
                $session->id,
                $historySlice,
            );
            $alignmentNote = trim((string) ($draft['icp_alignment_note'] ?? ''));
            $draftBody = (string) ($draft['body'] ?? '');
            $assistantBody = $alignmentNote !== ''
                ? "**Why these leads**\n{$alignmentNote}\n\n---\n\n{$draftBody}"
                : $draftBody;
            $meta['outreach'] = $draft;
            $leads = $draft['leads'] ?? [];
        } else {
            $activeIcp = $this->icps->active($organization) ?? $icp;
            if ($this->valueSeeking->matches($effectiveBody) && $this->opportunityRetriever->isEnabled()) {
                $retrieved = $this->opportunityRetriever->answer(
                    $organization,
                    $activeIcp,
                    $effectiveBody,
                    $user,
                    $clientTimezone,
                    $historySlice,
                );
                $assistantBody = $retrieved['body'];
                $meta['retrieval'] = 'live_opportunity';
                $meta['sources'] = $retrieved['sources'];
            } else {
                $assistantBody = $this->freeformReply(
                    $organization,
                    $activeIcp,
                    $session,
                    $effectiveBody,
                    $user,
                    $clientTimezone,
                    $userMessage->id,
                );
            }
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

        $userMeta = is_array($userMessage->meta) ? $userMessage->meta : [];
        $effectiveBody = trim((string) ($userMeta['effective_query'] ?? '')) !== ''
            ? (string) $userMeta['effective_query']
            : (string) $userMessage->body;
        $intent = (string) $run->intent;
        $leads = [];
        $meta = ['intent' => $intent, 'discovery_run_id' => $run->id];
        $historySlice = $this->memory->recentTurns($session, 6, $userMessage->id);

        try {
            if ($intent === 'quick_research') {
                $result = $this->research->run(
                    $organization,
                    $icp,
                    $user,
                    $effectiveBody,
                    $session->id,
                    $run,
                    $historySlice,
                );
                $meta['research'] = $result['research'];
                $assistantBody = $result['narrative'];
            } elseif (in_array($intent, ['generate_leads', 'generate_more_leads'], true)) {
                $icpSearchBrief = (bool) ($userMeta['icp_search_brief'] ?? false);
                $briefUserQuery = trim((string) ($userMeta['brief_user_query'] ?? ''));
                $searchQueryOverride = null;

                if ($icpSearchBrief) {
                    // Re-seed from the current ICP so edits between queue and run take effect.
                    $searchQueryOverride = IcpBrief::fromIcpProfile($icp)->searchBrief();
                    $effectiveBody = $searchQueryOverride;
                    if ($briefUserQuery === '') {
                        $briefUserQuery = trim((string) ($userMeta['original_query'] ?? $userMessage->body));
                    }
                    if (! $this->intentResolver->isGenericLeadBody($briefUserQuery)) {
                        $briefUserQuery = 'generate leads';
                    }
                    $run->update(['query' => $effectiveBody]);
                    $userMeta['effective_query'] = $effectiveBody;
                    $userMeta['icp_search_brief'] = true;
                    $userMeta['brief_user_query'] = $briefUserQuery;
                    $userMessage->update(['meta' => $userMeta]);
                } else {
                    $normalized = $this->leadQueryNormalizer->normalize($effectiveBody, $icp);
                    if (trim($normalized) !== '' && trim($normalized) !== trim($effectiveBody)) {
                        $meta['original_query'] = $effectiveBody;
                        $meta['query_normalized'] = true;
                        $effectiveBody = $normalized;
                        $run->update(['query' => $effectiveBody]);
                        $userMeta['effective_query'] = $effectiveBody;
                        $userMeta['original_query'] = $meta['original_query'];
                        $userMeta['query_normalized'] = true;
                        $userMessage->update(['meta' => $userMeta]);
                    }
                    $briefUserQuery = $effectiveBody;
                }

                $excludeLeadNames = array_values(array_filter(array_map(
                    'strval',
                    is_array($userMeta['exclude_lead_names'] ?? null) ? $userMeta['exclude_lead_names'] : [],
                )));
                if ($intent === 'generate_more_leads' && $excludeLeadNames === []) {
                    $excludeLeadNames = $this->recentLeadNamesFromSession($session);
                }

                $brief = IcpBrief::fromIcpProfile($icp, $briefUserQuery);
                if ($searchQueryOverride !== null) {
                    $brief = $brief->withSearchQueryOverride($searchQueryOverride);
                }
                $result = $this->discovery->run(
                    $organization,
                    $icp,
                    $user,
                    $briefUserQuery,
                    $intent,
                    $session->id,
                    $brief->requestedLimit,
                    $run,
                    $excludeLeadNames,
                    $intent !== 'generate_more_leads',
                    $searchQueryOverride,
                );
                $leads = $result['leads'];
                if ($intent === 'generate_more_leads') {
                    $meta['generate_more'] = true;
                }
                if ($icpSearchBrief) {
                    $meta['icp_search_brief'] = true;
                }
                $assistantBody = $this->narrateDiscovery(
                    $organization,
                    $icp,
                    $effectiveBody,
                    $leads,
                    $intent,
                    $clientTimezone,
                    $historySlice,
                );
            } else {
                $run->update(['status' => 'failed', 'error' => 'Unsupported async intent.', 'finished_at' => now()]);

                return;
            }

            $run->refresh();
            if ($run->status === 'cancelled') {
                return;
            }

            // Prefer the message for this run (even if failRun already cleared pending
            // and wrote a timeout body) so we do not leave duplicate assistant replies.
            $placeholder = $this->assistantMessageForRun($session->id, $userMessage->id, $run->id);

            if ($placeholder) {
                $placeholder->update([
                    'body' => $assistantBody,
                    'intent' => $intent,
                    'leads' => $leads ?: null,
                    'meta' => array_merge($meta, ['pending' => false]),
                ]);
            } else {
                ChatMessage::query()->create([
                    'chat_session_id' => $session->id,
                    'role' => 'assistant',
                    'body' => $assistantBody,
                    'intent' => $intent,
                    'leads' => $leads ?: null,
                    'meta' => array_merge($meta, ['pending' => false]),
                ]);
            }

            if ($run->fresh()?->status !== 'completed') {
                $run->update([
                    'status' => 'completed',
                    'error' => null,
                    'finished_at' => $run->finished_at ?? now(),
                ]);
            } else {
                $run->update(['error' => null]);
            }

            $session->touch();
        } catch (\Throwable $e) {
            $placeholder = $this->assistantMessageForRun($session->id, $userMessage->id, $run->id);

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
                    'meta' => array_merge($meta, ['error' => $e->getMessage(), 'pending' => false]),
                ]);
            }
            $session->touch();
        }
    }

    private function assistantMessageForRun(int $sessionId, int $userMessageId, int $runId): ?ChatMessage
    {
        $messages = ChatMessage::query()
            ->where('chat_session_id', $sessionId)
            ->where('role', 'assistant')
            ->where('id', '>', $userMessageId)
            ->orderBy('id')
            ->get();

        $forRun = $messages->first(
            fn(ChatMessage $message) => (int) ($message->meta['discovery_run_id'] ?? 0) === $runId
        );
        if ($forRun) {
            return $forRun;
        }

        return $messages->first(fn(ChatMessage $message) => (bool) ($message->meta['pending'] ?? false));
    }

    /**
     * @return list<string>
     */
    private function recentLeadNamesFromSession(ChatSession $session): array
    {
        $names = [];
        $messages = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->whereIn('intent', ['generate_leads', 'generate_more_leads'])
            ->orderByDesc('id')
            ->limit(8)
            ->get(['leads']);

        foreach ($messages as $message) {
            $leads = is_array($message->leads) ? $message->leads : [];
            foreach ($leads as $lead) {
                if (! is_array($lead)) {
                    continue;
                }
                $name = trim((string) ($lead['name'] ?? $lead['contact_person'] ?? ''));
                if ($name !== '') {
                    $names[mb_strtolower($name)] = $name;
                }
            }
        }

        return array_values($names);
    }

    private function recentGenerateQueryFromSession(ChatSession $session): ?string
    {
        $message = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'user')
            ->whereIn('intent', ['generate_leads', 'generate_more_leads'])
            ->orderByDesc('id')
            ->first(['body', 'meta']);

        if (! $message) {
            return null;
        }

        $meta = is_array($message->meta) ? $message->meta : [];

        // Polluted context-derived queries must not seed "generate more".
        if ((bool) ($meta['icp_search_brief'] ?? false)) {
            return null;
        }

        $effective = trim((string) ($meta['effective_query'] ?? ''));
        if ($effective !== '') {
            return $effective;
        }

        $body = trim((string) $message->body);

        return $body !== '' ? $body : null;
    }

    private function recentGenerateWasIcpSearchBrief(ChatSession $session): bool
    {
        $message = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'user')
            ->whereIn('intent', ['generate_leads', 'generate_more_leads'])
            ->orderByDesc('id')
            ->first(['meta']);

        if (! $message) {
            return false;
        }

        $meta = is_array($message->meta) ? $message->meta : [];

        return (bool) ($meta['icp_search_brief'] ?? false);
    }

    /**
     * Build a grounded discovery reply from the structured leads payload only.
     * Never ask GLM to list leads — prior chat context caused invented names that
     * disagreed with the cards below.
     *
     * @param  list<array<string, mixed>>  $leads
     * @param  list<array{role: string, content: string}>  $historySlice
     */
    private function narrateDiscovery(
        Organization $organization,
        IcpProfile $icp,
        string $query,
        array $leads,
        string $intent,
        ?string $clientTimezone = null,
        array $historySlice = [],
    ): string {
        $count = count($leads);
        $hasUserQuery = trim($query) !== '';

        if ($count === 0) {
            if ($hasUserQuery) {
                return 'No leads could be extracted for your search. Try a broader industry or role (for example FinTech CEOs in Africa), or generate from your active ICP without extra wording.';
            }

            return "No leads met the match threshold for ICP \"{$icp->name}\". Try refining territories or industries.";
        }

        $icpRecommendedCount = count(array_filter($leads, fn(array $lead) => (bool) ($lead['icp_recommended'] ?? false)));
        $advisoryNote = $this->buildIcpAdvisoryNote($icp, $count, $icpRecommendedCount, $hasUserQuery);

        return $this->formatGroundedLeadNarration($leads, $count, $advisoryNote);
    }

    /**
     * @param  list<array<string, mixed>>  $leads
     */
    private function formatGroundedLeadNarration(array $leads, int $count, string $advisoryNote): string
    {
        $noun = $count === 1 ? 'lead' : 'leads';
        $lines = ["Found {$count} {$noun} for your search.", ''];

        foreach (array_values($leads) as $index => $lead) {
            $name = trim((string) ($lead['name'] ?? 'Unknown'));
            $title = trim((string) ($lead['title'] ?? ''));
            $company = trim((string) ($lead['company'] ?? ''));
            $role = match (true) {
                $title !== '' && $company !== '' => "{$title} at {$company}",
                $title !== '' => $title,
                $company !== '' => $company,
                default => '',
            };

            $why = trim((string) ($lead['icp_relevance_reason'] ?? ''));
            if ($why === '') {
                $why = trim((string) ($lead['summary'] ?? ''));
            }
            // Keep bullet bodies short so the cards remain the detailed view.
            if (mb_strlen($why) > 220) {
                $why = rtrim(mb_substr($why, 0, 217)) . '…';
            }

            $heading = ($index + 1) . '. ' . $name;
            if ($role !== '') {
                $heading .= ' — ' . $role;
            }
            $lines[] = $heading;
            if ($why !== '') {
                $lines[] = $why;
            }
            $lines[] = '';
        }

        $lines[] = 'Review the cards below (Overall / Search / ICP / Intent scores) and save selected leads to CRM.' . $advisoryNote;

        return trim(implode("\n", $lines));
    }

    private function buildIcpAdvisoryNote(IcpProfile $icp, int $total, int $icpRecommendedCount, bool $hasUserQuery): string
    {
        if (! $hasUserQuery || $total === 0) {
            return '';
        }

        if ($icpRecommendedCount === $total) {
            return " All {$total} score strongly against your ICP \"{$icp->name}\".";
        }

        if ($icpRecommendedCount === 0) {
            return ' These answer your search; compare the Search / ICP / Intent % on each card to decide what to save.';
        }

        return ' Compare Overall, Search, ICP, and Intent % on each card — stronger ICP fit is ranked higher when scores are close.';
    }

    private function freeformReply(
        Organization $organization,
        ?IcpProfile $icp,
        ChatSession $session,
        string $body,
        User $user,
        ?string $clientTimezone = null,
        ?int $excludeMessageId = null,
    ): string {
        if (! $this->glm->isConfigured()) {
            return 'Sales Engine is ready. Configure GLM_API_KEY for full chat, or use generate_leads / quick_research intents once Serper (and optional registries) are keyed.';
        }

        $window = max(1, (int) config('services.chat.history_window', 20));
        $history = $this->memory->recentTurns($session, $window, $excludeMessageId);
        $summary = $this->memory->getOrRefreshSummary($session, $organization);

        $firstName = trim(explode(' ', trim($user->name ?? ''), 2)[0] ?? '');
        $system = $this->icpChatContext->buildFreeformSystemPrompt($icp, $firstName, $clientTimezone);
        if ($summary) {
            $system .= "\n\nConversation memory (older turns summarized):\n" . $summary;
        }

        $messages = [['role' => 'system', 'content' => $system]];
        foreach ($history as $turn) {
            $messages[] = $turn;
        }

        // Ensure the latest effective query is the final user turn (history may already
        // include an earlier raw message; avoid duplicate by only appending when needed).
        $last = $messages[count($messages) - 1] ?? null;
        if (! $last || ($last['role'] ?? '') !== 'user' || trim((string) ($last['content'] ?? '')) !== trim($body)) {
            $messages[] = ['role' => 'user', 'content' => $body];
        }

        try {
            return $this->listNumbering->normalize($this->glm->chat($messages, 'chat', $organization));
        } catch (\Throwable $e) {
            return 'Chat temporarily unavailable: ' . $e->getMessage();
        }
    }
}
