<?php

namespace App\Services\Chat;

use App\Models\ChatMessage;
use App\Models\ChatSession;

class ChatIntentResolver
{
    /**
     * @return array{intent: string, body: string}
     */
    public function resolve(ChatSession $session, string $body, string $intent): array
    {
        if ($intent !== 'freeform') {
            return ['intent' => $intent, 'body' => $body];
        }

        if (! $this->looksLikeLeadGeneration($body)) {
            return ['intent' => $intent, 'body' => $body];
        }

        $expandedBody = $this->expandQueryWithContext($session, $body);

        return [
            'intent' => 'generate_leads',
            'body' => $expandedBody,
        ];
    }

    public function looksLikeLeadGeneration(string $body): bool
    {
        $normalized = mb_strtolower(trim($body));

        $patterns = [
            '/\b(create|generate|find|get|show|list|build|make|add)\s+(a\s+)?leads?\b/u',
            '/\bleads?\s+for\b/u',
            '/\b(find|get|show|list)\s+(prospects?|contacts?|companies|accounts)\b/u',
            '/\b(save|sync|add)\s+(these|them|all|selected)?\s*(to\s+)?(crm|pipeline)\b/u',
            '/\btop\s+\d{1,2}\b/u',
            '/\b\d{1,2}\s+(leads?|prospects?|contacts?|people|companies)\b/u',
            '/\b(all|each)\s+of\s+(these|them|those)\b/u',
            '/\b(these|those|them)\s+(top\s+)?\d*\s*(wealthiest|richest|best|important|key)\b/u',
            '/\bwealthiest\s+(men|people|persons|individuals|executives)\b/u',
            '/\bgenerate\s+new\s+leads\b/u',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $normalized)) {
                return true;
            }
        }

        return false;
    }

    private function expandQueryWithContext(ChatSession $session, string $body): string
    {
        if (! $this->referencesPriorResults($body)) {
            return $body;
        }

        $contextMessages = ChatMessage::query()
            ->where('chat_session_id', $session->id)
            ->where('role', 'assistant')
            ->orderByDesc('id')
            ->limit(2)
            ->get()
            ->reverse()
            ->filter(fn (ChatMessage $message) => trim($message->body) !== '' && ! ($message->meta['pending'] ?? false))
            ->map(fn (ChatMessage $message) => mb_substr(trim($message->body), 0, 600))
            ->values();

        if ($contextMessages->isEmpty()) {
            return $body;
        }

        $context = $contextMessages->implode("\n\n");

        return "Context from prior assistant response:\n{$context}\n\nUser request: {$body}";
    }

    private function referencesPriorResults(string $body): bool
    {
        $normalized = mb_strtolower(trim($body));

        return (bool) preg_match(
            '/\b(these|those|them|all of them|the list|above|from (that|the) (list|results?|response))\b/u',
            $normalized
        );
    }
}
