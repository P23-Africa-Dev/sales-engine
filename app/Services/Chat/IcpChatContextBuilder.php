<?php

namespace App\Services\Chat;

use App\Models\IcpProfile;
use App\Support\TimeGreeting;

class IcpChatContextBuilder
{
    /**
     * Structured ICP fields for LLM prompts (active profile only).
     *
     * @return array<string, mixed>|null
     */
    public function toPromptPayload(?IcpProfile $icp): ?array
    {
        if (! $icp) {
            return null;
        }

        $config = is_array($icp->config) ? $icp->config : [];

        return [
            'name' => $icp->name,
            'description' => (string) ($icp->description ?: ($config['description'] ?? '')),
            'industries' => array_values(array_filter($config['industries'] ?? [], 'is_string')),
            'territories' => array_values(array_filter($config['territories'] ?? [], 'is_string')),
            'company_sizes' => array_values(array_filter($config['companySizes'] ?? [], 'is_string')),
            'revenue_ranges' => array_values(array_filter($config['revenueRanges'] ?? [], 'is_string')),
            'decision_makers' => array_values(array_filter($config['decisionMakers'] ?? [], 'is_string')),
            'custom_prompt' => trim((string) ($config['customPrompt'] ?? '')),
            'min_match_score' => (int) ($config['minMatchScore'] ?? 60),
        ];
    }

    public function buildFreeformSystemPrompt(
        ?IcpProfile $icp,
        string $firstName = '',
        ?string $clientTimezone = null,
    ): string {
        $parts = [
            'You are Sales Engine, an intelligent B2B sales advisor.',
            'Your job is to give satisfying, actionable answers AND continuously advise using the user\'s ACTIVE Ideal Customer Profile (ICP).',
            'The ICP describes who the user sells to and what market they care about — treat it as their interest model for every reply.',
            TimeGreeting::promptContext($clientTimezone),
        ];

        if ($firstName !== '') {
            $parts[] = "User's first name: {$firstName}. Use it naturally when greeting.";
        }

        $parts[] = 'When the user greets you (hello, hi, etc.), reply with the appropriate time-of-day greeting above — never the wrong period.';

        $payload = $this->toPromptPayload($icp);
        if ($payload === null) {
            $parts[] = 'No active ICP is set. Answer helpfully, then gently suggest activating or building an ICP so recommendations can be personalized.';
        } else {
            $parts[] = 'ACTIVE ICP (authoritative — use these fields; never invent a different ICP):';
            $parts[] = json_encode($payload, JSON_UNESCAPED_UNICODE);
            $parts[] = $this->advisoryRules();
        }

        $parts[] = 'Never claim that lead cards, Save buttons, or CRM sync actions are visible in the chat. For structured lead results with save-to-CRM cards, tell the user to tap Generate New Leads or ask explicitly to generate leads.';
        $parts[] = 'Do not ask the user to re-describe their business or ICP when an active ICP payload is provided — you already have it.';

        return implode("\n", array_filter($parts));
    }

    private function advisoryRules(): string
    {
        return implode("\n", [
            'Response rules when an active ICP is present:',
            '1. Answer the user\'s question directly with useful, concrete content (opportunities, trends, tactics, explanations) — never reply with only a request for more business details.',
            '2. After the answer, include a short section titled exactly: "Based on your active ICP".',
            '3. In that section, recommend 3–5 prioritized opportunities, angles, or next moves that fit the active ICP industries, territories, company sizes, and decision makers.',
            '4. For each recommendation, give a one-line reason that cites ICP fields (e.g. industry, territory, buyer persona).',
            '5. If the question is unrelated to sales/GTM, still answer it, then briefly note any ICP-relevant angle only if there is a genuine connection — do not force irrelevant recommendations.',
            '6. If the user asks you to "use my ICP", apply the active ICP payload immediately; never substitute a generic wealth/tech celebrity list or invent ICP criteria.',
            '7. Prefer timely, actionable opportunities over generic textbook lists (market gaps, flash sales, etc.) unless those lists are explicitly tied to the ICP.',
            '8. When listing multiple items, number them sequentially as 1. 2. 3. — never repeat "1." for every item.',
            '9. End with one optional next step (e.g. refine ICP, run Generate New Leads, or dig into one recommendation) when helpful.',
        ]);
    }
}
