<?php

namespace App\Services\Outreach;

use App\Models\ChatMessage;
use App\Models\CompanyContact;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\SocialSignal;
use App\Support\TimeGreeting;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Collection;
use InvalidArgumentException;

class OutreachDraftService
{
    public function __construct(
        private readonly GlmClient $glm,
        private readonly \App\Services\Chat\IcpChatContextBuilder $icpChatContext,
    ) {}

    /**
     * @param  list<array{role: string, content: string}>  $historySlice
     * @return array{channel: string, subject?: string|null, body: string, sent: bool, leads?: list<array>, target_lead_ids: list<int>, icp_alignment_note: string}
     */
    public function draftFromPrompt(
        Organization $organization,
        IcpProfile $icp,
        string $prompt,
        ?string $clientTimezone = null,
        ?int $chatSessionId = null,
        array $historySlice = [],
    ): array {
        $channel = str_contains(mb_strtolower($prompt), 'whatsapp') ? 'whatsapp' : 'email';

        if ($channel === 'whatsapp') {
            $this->assertWhatsAppNotAutoSent();
        }

        $leads = $this->resolveLeads($organization, $icp, $chatSessionId);

        $body = $this->compose($organization, $icp, $prompt, $channel, $leads->all(), $clientTimezone, $historySlice);
        $alignmentNote = $this->buildIcpAlignmentNote($icp, $leads->all());

        foreach ($leads as $lead) {
            OutreachActivity::query()->create([
                'organization_id' => $organization->id,
                'lead_id' => $lead->id,
                'company_id' => $lead->company_id,
                'name' => $lead->name,
                'channel' => $channel . ' draft',
                'preview' => mb_substr($body, 0, 160),
                'accent_bg' => $channel === 'whatsapp' ? '#E8F8EF' : '#EEF2FF',
                'accent_icon' => $channel === 'whatsapp' ? '#16A34A' : '#4F46E5',
                'occurred_at' => now(),
                'meta' => ['sent' => false],
            ]);
        }

        return [
            'channel' => $channel,
            'subject' => $channel === 'email' ? 'Introduction — ' . $icp->name : null,
            'body' => $body,
            'sent' => false,
            'target_lead_ids' => $leads->pluck('id')->map(fn($id) => (int) $id)->all(),
            'icp_alignment_note' => $alignmentNote,
            'leads' => $leads->map(fn(Lead $l) => [
                'id' => $l->id,
                'name' => $l->name,
                'source' => $l->source,
                'score' => (int) round((float) $l->score),
                'summary' => $l->summary,
                'crm_synced' => filled($l->synced_to_f23_at),
                'crm_duplicate' => filled($l->crm_duplicate_of),
                'crm_duplicate_reason' => $l->crm_duplicate_reason,
                'crm_fields_updated' => $l->crm_fields_updated ?? [],
                'f23_lead_id' => $l->f23_lead_id,
                'icp_relevance_reason' => is_array($l->meta)
                    ? (trim((string) ($l->meta['icp_relevance_reason'] ?? '')) ?: null)
                    : null,
            ])->all(),
        ];
    }

    /**
     * @return array{channel: string, subject: ?string, body: string, sent: bool, social_signal_id: int}
     */
    public function draftFromSocialSignal(
        Organization $organization,
        IcpProfile $icp,
        SocialSignal $signal,
        ?string $clientTimezone = null,
    ): array {
        $prompt = "Respond to this social post with a compliant email outreach draft.\n\nPost: {$signal->post_text}\nPersona: {$signal->persona}\nProblem: {$signal->problem}";

        $body = $signal->suggested_message ?: $this->compose($organization, $icp, $prompt, 'email', [], $clientTimezone);

        $activity = OutreachActivity::query()->create([
            'organization_id' => $organization->id,
            'social_signal_id' => $signal->id,
            'lead_id' => $signal->lead_id,
            'name' => $signal->profile_name ?? $signal->company_name ?? 'Social prospect',
            'channel' => 'email draft',
            'preview' => mb_substr($body, 0, 160),
            'accent_bg' => '#EEF2FF',
            'accent_icon' => '#4F46E5',
            'occurred_at' => now(),
            'meta' => ['sent' => false, 'social_signal_id' => $signal->id],
        ]);

        $signal->update(['status' => 'outreached']);

        return [
            'channel' => 'email',
            'subject' => 'Following up on your post',
            'body' => $body,
            'sent' => false,
            'social_signal_id' => $signal->id,
            'activity_id' => $activity->id,
        ];
    }

    /**
     * @return Collection<int, Lead>
     */
    private function resolveLeads(Organization $organization, IcpProfile $icp, ?int $chatSessionId): Collection
    {
        if ($chatSessionId) {
            $message = ChatMessage::query()
                ->where('chat_session_id', $chatSessionId)
                ->where('role', 'assistant')
                ->whereNotNull('leads')
                ->orderByDesc('id')
                ->first();

            if ($message && is_array($message->leads) && count($message->leads) > 0) {
                $ids = collect($message->leads)
                    ->pluck('id')
                    ->filter(fn($id) => is_numeric($id))
                    ->map(fn($id) => (int) $id)
                    ->all();

                if ($ids !== []) {
                    $sessionLeads = Lead::query()
                        ->where('organization_id', $organization->id)
                        ->whereIn('id', $ids)
                        ->orderByDesc('score')
                        ->limit(3)
                        ->get();

                    if ($sessionLeads->isNotEmpty()) {
                        return $sessionLeads;
                    }
                }
            }
        }

        return Lead::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->orderByDesc('score')
            ->limit(3)
            ->get();
    }

    public function assertCanSendWhatsApp(?CompanyContact $contact): void
    {
        if (! $contact || ! $contact->whatsapp_opt_in || ! $contact->whatsapp_opt_in_at) {
            throw new InvalidArgumentException('WhatsApp messages require explicit opt-in (whatsapp_opt_in_at).');
        }
    }

    private function assertWhatsAppNotAutoSent(): void
    {
        // Draft-only by design; send endpoints must call assertCanSendWhatsApp.
    }

    /**
     * @param  list<Lead>  $leads
     * @param  list<array{role: string, content: string}>  $historySlice
     */
    private function compose(
        Organization $organization,
        IcpProfile $icp,
        string $prompt,
        string $channel,
        array $leads,
        ?string $clientTimezone = null,
        array $historySlice = [],
    ): string {
        if (! $this->glm->isConfigured()) {
            $names = collect($leads)->pluck('name')->implode(', ');
            $greeting = TimeGreeting::phrase($clientTimezone);

            return "{$greeting} — following up regarding {$icp->name}. " . ($names ? "Relevant accounts: {$names}. " : '') . trim($prompt);
        }

        try {
            $messages = [
                [
                    'role' => 'system',
                    'content' => "Draft a concise {$channel} outreach message for the user's specific request. Do not claim the message was sent. Professional tone for African B2B. " . TimeGreeting::promptContext($clientTimezone) . ' Use the active ICP industries, territories, and decision makers to tailor the angle. Reference the provided lead context when relevant. When prior chat turns are provided, keep continuity with that conversation. Output ONLY the sendable message body — no ICP analysis preamble.',
                ],
            ];

            foreach (array_slice($historySlice, -4) as $turn) {
                if (($turn['role'] ?? '') === 'user' || ($turn['role'] ?? '') === 'assistant') {
                    $messages[] = ['role' => $turn['role'], 'content' => (string) ($turn['content'] ?? '')];
                }
            }

            $messages[] = [
                'role' => 'user',
                'content' => json_encode([
                    'prompt' => $prompt,
                    'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                    'leads' => collect($leads)->map(function (Lead $lead) {
                        $meta = is_array($lead->meta) ? $lead->meta : [];

                        return [
                            'name' => $lead->name,
                            'summary' => $lead->summary,
                            'score' => $lead->score,
                            'icp_relevance_reason' => $meta['icp_relevance_reason'] ?? null,
                        ];
                    })->all(),
                ], JSON_UNESCAPED_UNICODE),
            ];

            return $this->glm->chat($messages, 'outreach_draft', $organization);
        } catch (\Throwable) {
            return "Draft outreach for {$icp->name}: " . $prompt;
        }
    }

    /**
     * @param  list<Lead>  $leads
     */
    private function buildIcpAlignmentNote(IcpProfile $icp, array $leads): string
    {
        $config = is_array($icp->config) ? $icp->config : [];
        $industries = array_slice(array_values(array_filter($config['industries'] ?? [], 'is_string')), 0, 2);
        $territories = array_slice(array_values(array_filter($config['territories'] ?? [], 'is_string')), 0, 2);

        $industryLabel = $industries !== [] ? implode(' / ', $industries) : 'your ICP industries';
        $territoryLabel = $territories !== [] ? implode(' / ', $territories) : null;

        $reasons = [];
        foreach ($leads as $lead) {
            $meta = is_array($lead->meta) ? $lead->meta : [];
            $reason = trim((string) ($meta['icp_relevance_reason'] ?? ''));
            if ($reason !== '') {
                $reasons[] = $lead->name . ': ' . $reason;
            }
        }

        $count = count($leads);
        if ($count === 0) {
            return "Drafted against your active ICP \"{$icp->name}\" ({$industryLabel}" . ($territoryLabel ? " in {$territoryLabel}" : '') . ').';
        }

        $intro = "Targeting these {$count} lead" . ($count === 1 ? '' : 's')
            . " because they relate to your {$industryLabel} focus"
            . ($territoryLabel ? " in {$territoryLabel}" : '')
            . '.';

        if ($reasons === []) {
            return $intro;
        }

        return $intro . ' ' . implode(' ', array_slice($reasons, 0, 3));
    }
}
