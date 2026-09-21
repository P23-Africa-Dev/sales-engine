<?php

namespace App\Services\Chat;

use App\Models\ChatSession;
use App\Models\Organization;
use App\Services\Discovery\QueryIntentService;

class ChatIntentResolver
{
    public function __construct(
        private readonly ConversationMemoryService $memory,
        private readonly QueryIntentService $queryIntent = new QueryIntentService,
    ) {}

    /**
     * @return array{intent: string, body: string, effective_body: string}
     */
    public function resolve(
        ChatSession $session,
        string $body,
        string $intent,
        ?Organization $organization = null,
    ): array {
        $organization ??= Organization::query()->find($session->organization_id);
        $effectiveBody = $body;

        // Generic generate asks must stay ICP-driven — never let chat history invent a theme.
        $skipContextualize = in_array($intent, ['generate_leads', 'generate_more_leads'], true)
            && $this->isGenericLeadBody($body);

        // Skip the expensive contextualize GLM call when the prompt is already
        // self-contained — especially important for Quick Research latency.
        if (
            ! $skipContextualize
            && $organization
            && $this->needsConversationContext($session, $body)
        ) {
            $contextualized = $this->memory->contextualize($session, $body, $organization);
            $effectiveBody = $contextualized['effective_query'];
        }

        if ($intent !== 'freeform') {
            return [
                'intent' => $intent,
                'body' => $body,
                'effective_body' => $effectiveBody,
            ];
        }

        if (! $this->looksLikeLeadGeneration($effectiveBody) && ! $this->looksLikeLeadGeneration($body)) {
            return [
                'intent' => $intent,
                'body' => $body,
                'effective_body' => $effectiveBody,
            ];
        }

        return [
            'intent' => 'generate_leads',
            'body' => $body,
            'effective_body' => $effectiveBody,
        ];
    }

    /**
     * True when the latest message likely depends on prior turns (pronouns,
     * very short follow-ups, or explicit references to earlier context).
     */
    public function needsConversationContext(ChatSession $session, string $body): bool
    {
        $normalized = mb_strtolower(trim($body));
        if ($normalized === '') {
            return false;
        }

        // Short follow-ups almost always need history ("and Nigeria?", "more on that").
        $wordCount = count(preg_split('/\s+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: []);
        if ($wordCount > 0 && $wordCount <= 6) {
            return $this->sessionHasPriorUserTurns($session);
        }

        $referencePatterns = [
            '/\b(this|that|these|those|it|they|them|their)\b/u',
            '/\b(above|earlier|previous|prior|same|again)\b/u',
            '/\b(also|more|another|expand|elaborate|follow[- ]?up)\b/u',
            '/\b(what about|how about|and for)\b/u',
        ];

        foreach ($referencePatterns as $pattern) {
            if (preg_match($pattern, $normalized)) {
                return $this->sessionHasPriorUserTurns($session);
            }
        }

        return false;
    }

    private function sessionHasPriorUserTurns(ChatSession $session): bool
    {
        return $this->memory->recentTurns($session, 2) !== [];
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
            '/\bprovide\s+(me\s+)?(necessary\s+)?leads?\b/u',
            '/\bleads?\s+that\s+(will|can|could)\b/u',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $normalized)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Vague generate prompts ("50 leads", "give me prospects") must not pull a theme from chat history.
     */
    public function isGenericLeadBody(string $body): bool
    {
        $cleaned = $this->queryIntent->stripProspectCountInstruction($body);

        return trim($cleaned) === '' || $this->queryIntent->isGenericLeadRequest($cleaned);
    }
}
