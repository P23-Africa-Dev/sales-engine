<?php

namespace App\Services\Chat;

use App\Models\ChatSession;
use App\Models\Organization;

class ChatIntentResolver
{
    public function __construct(
        private readonly ConversationMemoryService $memory,
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

        if ($organization) {
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
}
