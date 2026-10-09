<?php

namespace App\Services\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\Organization;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Log;

class ConversationMemoryService
{
    private const BODY_CLIP = 800;

    public function __construct(private readonly GlmClient $glm) {}

    /**
     * Last N non-pending messages as GLM-ready turns.
     *
     * @return list<array{role: string, content: string}>
     */
    public function recentTurns(ChatSession $session, int $limit, ?int $excludeMessageId = null): array
    {
        $limit = max(1, $limit);

        $query = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->orderByDesc('id')
            ->limit($limit * 2);

        if ($excludeMessageId !== null) {
            $query->where('id', '!=', $excludeMessageId);
        }

        $messages = $query->get()
            ->filter(function (ChatMessage $message) {
                if (trim((string) $message->body) === '') {
                    return false;
                }

                $meta = is_array($message->meta) ? $message->meta : [];

                return ! ($meta['pending'] ?? false);
            })
            ->take($limit)
            ->reverse()
            ->values();

        return $messages->map(fn (ChatMessage $message) => [
            'role' => in_array($message->role, ['user', 'assistant', 'system'], true) ? $message->role : 'user',
            'content' => $this->clip((string) $message->body, self::BODY_CLIP),
        ])->all();
    }

    /**
     * Rolling summary of aged-out turns. Returns null when GLM is unavailable
     * or there is not enough history to summarize.
     */
    public function getOrRefreshSummary(ChatSession $session, Organization $organization): ?string
    {
        $window = max(1, (int) config('services.chat.history_window', 20));
        $trigger = max($window + 1, (int) config('services.chat.summary_trigger', 40));

        $total = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where(function ($q) {
                $q->whereNull('meta')
                    ->orWhereRaw("JSON_EXTRACT(meta, '$.pending') IS NULL")
                    ->orWhereRaw("JSON_EXTRACT(meta, '$.pending') = false")
                    ->orWhereRaw("JSON_EXTRACT(meta, '$.pending') = 0");
            })
            ->count();

        if ($total <= $trigger) {
            $existing = trim((string) ($session->context_summary ?? ''));

            return $existing !== '' ? $existing : null;
        }

        if (! $this->glm->isConfigured()) {
            $existing = trim((string) ($session->context_summary ?? ''));

            return $existing !== '' ? $existing : null;
        }

        $keepIds = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->orderByDesc('id')
            ->limit($window)
            ->pluck('id')
            ->all();

        $throughId = (int) ($session->context_summary_through_message_id ?? 0);

        $aged = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->when($keepIds !== [], fn ($q) => $q->whereNotIn('id', $keepIds))
            ->when($throughId > 0, fn ($q) => $q->where('id', '>', $throughId))
            ->orderBy('id')
            ->limit(40)
            ->get()
            ->filter(fn (ChatMessage $m) => trim((string) $m->body) !== '' && ! (($m->meta['pending'] ?? false)))
            ->values();

        if ($aged->isEmpty()) {
            $existing = trim((string) ($session->context_summary ?? ''));

            return $existing !== '' ? $existing : null;
        }

        $existingSummary = trim((string) ($session->context_summary ?? ''));
        $transcript = $aged->map(function (ChatMessage $m) {
            $role = strtoupper((string) $m->role);

            return "{$role}: ".$this->clip((string) $m->body, 400);
        })->implode("\n");

        try {
            $summary = $this->glm->chat([
                [
                    'role' => 'system',
                    'content' => 'Summarize this sales-chat transcript into a compact memory for future turns. '
                        .'Preserve: topics the user cares about, named people/companies, stated goals, '
                        .'decisions, and open questions. Max 12 bullet points. No fluff.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'existing_summary' => $existingSummary !== '' ? $existingSummary : null,
                        'new_turns' => $transcript,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            $summary = trim($summary);
            if ($summary === '') {
                return $existingSummary !== '' ? $existingSummary : null;
            }

            $session->update([
                'context_summary' => $summary,
                'context_summary_through_message_id' => (int) $aged->last()->id,
            ]);

            return $summary;
        } catch (\Throwable $e) {
            Log::warning('Chat context summary refresh failed', [
                'session_id' => $session->id,
                'error' => $e->getMessage(),
            ]);

            return $existingSummary !== '' ? $existingSummary : null;
        }
    }

    /**
     * Resolve referential / short follow-ups into a self-contained query.
     *
     * @return array{effective_query: string, used_context: bool}
     */
    public function contextualize(ChatSession $session, string $body, Organization $organization): array
    {
        $raw = trim($body);
        if ($raw === '') {
            return ['effective_query' => $body, 'used_context' => false];
        }

        $historyWindow = min(8, max(1, (int) config('services.chat.history_window', 20)));
        $recent = $this->recentTurns($session, $historyWindow);

        if ($recent === []) {
            return ['effective_query' => $body, 'used_context' => false];
        }

        // Cheap gate: skip LLM when the message is long and has no referential language.
        if (! $this->needsContextualization($raw)) {
            return ['effective_query' => $body, 'used_context' => false];
        }

        $summary = $this->getOrRefreshSummary($session, $organization);

        if ($this->glm->isConfigured()) {
            try {
                $result = $this->glm->chatJson([
                    [
                        'role' => 'system',
                        'content' => 'Rewrite the latest user message into a self-contained query that preserves '
                            .'the user\'s intent while expanding pronouns and vague references using the chat history. '
                            .'Return JSON: {"effective_query":"...","used_context":true|false}. '
                            .'If the message is already clear and self-contained, return it unchanged with used_context=false. '
                            .'Do not invent facts not present in history/summary.',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'latest_user_message' => $raw,
                            'conversation_summary' => $summary,
                            'recent_turns' => $recent,
                        ], JSON_UNESCAPED_UNICODE),
                    ],
                ], 'extract', $organization);

                $effective = trim((string) ($result['effective_query'] ?? ''));
                $used = (bool) ($result['used_context'] ?? false);

                if ($effective !== '') {
                    return [
                        'effective_query' => $effective,
                        'used_context' => $used || mb_strtolower($effective) !== mb_strtolower($raw),
                    ];
                }
            } catch (\Throwable $e) {
                Log::warning('Chat contextualize GLM failed', [
                    'session_id' => $session->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Heuristic fallback (moved from ChatIntentResolver).
        if ($this->referencesPriorResults($raw)) {
            $context = collect($recent)
                ->filter(fn (array $turn) => ($turn['role'] ?? '') === 'assistant')
                ->take(-2)
                ->map(fn (array $turn) => $this->clip((string) ($turn['content'] ?? ''), 600))
                ->filter()
                ->implode("\n\n");

            if ($context !== '') {
                return [
                    'effective_query' => "Context from prior assistant response:\n{$context}\n\nUser request: {$raw}",
                    'used_context' => true,
                ];
            }
        }

        return ['effective_query' => $body, 'used_context' => false];
    }

    public function needsContextualization(string $body): bool
    {
        $normalized = mb_strtolower(trim($body));
        if ($normalized === '') {
            return false;
        }

        if ($this->referencesPriorResults($normalized)) {
            return true;
        }

        // Short/ambiguous follow-ups almost always depend on prior context.
        if (mb_strlen($normalized) <= 80) {
            return (bool) preg_match(
                '/\b(what|how|why|which|who|when|where|this|that|it|them|those|these|continue|same|more|again|further|regarding|about)\b/u',
                $normalized
            );
        }

        return false;
    }

    public function referencesPriorResults(string $body): bool
    {
        $normalized = mb_strtolower(trim($body));

        return (bool) preg_match(
            '/\b(these|those|them|all of them|the list|above|from (that|the) (list|results?|response)|this|that|it|same|regarding|about (this|that|it)|what do you think)\b/u',
            $normalized
        );
    }

    private function clip(string $value, int $max): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        return mb_strlen($value) <= $max ? $value : mb_substr($value, 0, $max).'…';
    }
}
