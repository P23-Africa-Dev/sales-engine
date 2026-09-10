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

        $composed = $this->compose($organization, $icp, $prompt, $channel, $leads->all(), $clientTimezone, $historySlice);
        $fallbackSubject = $channel === 'email' ? 'Introduction — ' . $icp->name : null;
        $normalized = $this->normalizeEmailParts($channel, $composed, $fallbackSubject);
        $body = $normalized['body'];
        $subject = $normalized['subject'];
        $alignmentNote = $this->buildIcpAlignmentNote($icp, $leads->all());
        $targetLeadIds = $leads->pluck('id')->map(fn($id) => (int) $id)->all();

        $activityIds = [];
        foreach ($leads as $lead) {
            $toEmail = $this->resolveLeadEmail($lead);
            $activity = OutreachActivity::query()->create([
                'organization_id' => $organization->id,
                'lead_id' => $lead->id,
                'company_id' => $lead->company_id,
                'name' => $lead->name,
                'channel' => $channel . ' draft',
                'preview' => mb_substr($body, 0, 160),
                'to_email' => $toEmail,
                'subject' => $subject,
                'body' => $body,
                'regeneration_count' => 0,
                'accent_bg' => $channel === 'whatsapp' ? '#E8F8EF' : '#EEF2FF',
                'accent_icon' => $channel === 'whatsapp' ? '#16A34A' : '#4F46E5',
                'occurred_at' => now(),
                'meta' => [
                    'sent' => false,
                    'prompt' => $prompt,
                    'icp_profile_id' => $icp->id,
                    'target_lead_ids' => $targetLeadIds,
                    'icp_alignment_note' => $alignmentNote,
                ],
            ]);
            $activityIds[] = $activity->id;
        }

        return [
            'channel' => $channel,
            'subject' => $subject,
            'body' => $body,
            'to_email' => $leads->isNotEmpty() ? $this->resolveLeadEmail($leads->first()) : null,
            'sent' => false,
            'target_lead_ids' => $targetLeadIds,
            'activity_ids' => $activityIds,
            'activity_id' => $activityIds[0] ?? null,
            'icp_alignment_note' => $alignmentNote,
            'leads' => $leads->map(fn(Lead $l) => [
                'id' => $l->id,
                'name' => $l->name,
                'source' => $l->source,
                'score' => (int) round((float) $l->score),
                'summary' => $l->summary,
                'email' => is_array($l->meta) ? (trim((string) ($l->meta['email'] ?? '')) ?: null) : null,
                'phone' => is_array($l->meta) ? (trim((string) ($l->meta['phone'] ?? '')) ?: null) : null,
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

        $composed = $signal->suggested_message ?: $this->compose($organization, $icp, $prompt, 'email', [], $clientTimezone);
        $normalized = $this->normalizeEmailParts('email', $composed, 'Following up on your post');
        $body = $normalized['body'];
        $subject = $normalized['subject'];
        $toEmail = $this->resolveSignalEmail($signal);

        $activity = OutreachActivity::query()->create([
            'organization_id' => $organization->id,
            'social_signal_id' => $signal->id,
            'lead_id' => $signal->lead_id,
            'name' => $signal->profile_name ?? $signal->company_name ?? 'Social prospect',
            'channel' => 'email draft',
            'preview' => mb_substr($body, 0, 160),
            'to_email' => $toEmail,
            'subject' => $subject,
            'body' => $body,
            'regeneration_count' => 0,
            'accent_bg' => '#EEF2FF',
            'accent_icon' => '#4F46E5',
            'occurred_at' => now(),
            'meta' => [
                'sent' => false,
                'social_signal_id' => $signal->id,
                'prompt' => $prompt,
                'icp_profile_id' => $icp->id,
            ],
        ]);

        $signal->update(['status' => 'outreached']);

        return [
            'channel' => 'email',
            'subject' => $subject,
            'body' => $body,
            'to_email' => $toEmail,
            'sent' => false,
            'social_signal_id' => $signal->id,
            'activity_id' => $activity->id,
        ];
    }

    /**
     * Re-run GLM compose for an existing draft activity with optional extra user instructions.
     * Updates the same activity row in place (stable activity_id for Send).
     *
     * @return array{channel: string, subject: ?string, body: string, to_email: ?string, sent: bool, activity_id: int, regeneration_count: int}
     */
    public function regenerate(
        OutreachActivity $activity,
        Organization $organization,
        IcpProfile $icp,
        ?string $instructions = null,
        ?string $channelOverride = null,
        ?string $clientTimezone = null,
    ): array {
        if (filled($activity->sent_at) || (($activity->meta['sent'] ?? false) === true)) {
            throw new InvalidArgumentException('Cannot regenerate an outreach that has already been sent.');
        }

        $meta = is_array($activity->meta) ? $activity->meta : [];
        $channel = $channelOverride
            ?? (str_contains(mb_strtolower((string) $activity->channel), 'whatsapp') ? 'whatsapp' : 'email');

        if ($channel === 'whatsapp') {
            $this->assertWhatsAppNotAutoSent();
        }

        $leads = $this->resolveLeadsForActivity($activity, $organization, $icp);
        $prompt = trim((string) ($meta['prompt'] ?? 'Draft a concise outreach message'));

        if ($activity->social_signal_id) {
            $signal = SocialSignal::query()
                ->where('organization_id', $organization->id)
                ->find($activity->social_signal_id);

            if ($signal) {
                $prompt = "Respond to this social post with a compliant email outreach draft.\n\nPost: {$signal->post_text}\nPersona: {$signal->persona}\nProblem: {$signal->problem}";
            }
        }

        $composed = $this->compose(
            $organization,
            $icp,
            $prompt,
            $channel,
            $leads->all(),
            $clientTimezone,
            [],
            $instructions,
        );

        $fallbackSubject = $channel === 'email'
            ? ($activity->social_signal_id ? 'Following up on your post' : 'Introduction — ' . $icp->name)
            : null;
        $normalized = $this->normalizeEmailParts($channel, $composed, $fallbackSubject);
        $body = $normalized['body'];
        $subject = $normalized['subject'];

        $activity->update([
            'channel' => $channel . ' draft',
            'preview' => mb_substr($body, 0, 160),
            'subject' => $subject,
            'body' => $body,
            'regeneration_count' => ((int) $activity->regeneration_count) + 1,
            'meta' => array_merge($meta, [
                'prompt' => $prompt,
                'icp_profile_id' => $icp->id,
                'last_regenerate_instructions' => $instructions,
            ]),
        ]);

        $activity->refresh();

        return $this->activityToDraftPayload($activity);
    }

    /**
     * @return array{channel: string, subject: ?string, body: string, to_email: ?string, sent: bool, activity_id: int, regeneration_count: int, leads?: list<array>, icp_alignment_note?: string|null, social_signal_id?: int|null}
     */
    public function activityToDraftPayload(OutreachActivity $activity): array
    {
        $meta = is_array($activity->meta) ? $activity->meta : [];
        $channel = str_contains(mb_strtolower((string) $activity->channel), 'whatsapp') ? 'whatsapp' : 'email';
        $sent = filled($activity->sent_at) || (($meta['sent'] ?? false) === true);

        $rawBody = (string) ($activity->body ?? $activity->preview ?? '');
        $normalized = $this->normalizeEmailParts($channel, $rawBody, $activity->subject);
        $subject = $normalized['subject'];
        $body = $normalized['body'];

        // Heal legacy drafts that still embed "Subject:" inside the message body.
        if (
            $channel === 'email'
            && preg_match('/^\s*subject\s*:/i', $rawBody) === 1
            && ($body !== $rawBody || (string) $subject !== (string) $activity->subject)
        ) {
            $activity->forceFill([
                'subject' => $subject,
                'body' => $body,
                'preview' => mb_substr($body, 0, 160),
            ])->save();
        }

        $payload = [
            'channel' => $channel,
            'subject' => $subject,
            'body' => $body,
            'to_email' => $activity->to_email,
            'sent' => $sent,
            'activity_id' => $activity->id,
            'regeneration_count' => (int) $activity->regeneration_count,
            'icp_alignment_note' => isset($meta['icp_alignment_note']) ? (string) $meta['icp_alignment_note'] : null,
            'social_signal_id' => $activity->social_signal_id ? (int) $activity->social_signal_id : null,
            'name' => $activity->name,
        ];

        if ($activity->lead_id) {
            $lead = $activity->relationLoaded('lead')
                ? $activity->lead
                : Lead::query()->find($activity->lead_id);

            if ($lead) {
                $payload['leads'] = [[
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'email' => is_array($lead->meta) ? (trim((string) ($lead->meta['email'] ?? '')) ?: null) : null,
                    'summary' => $lead->summary,
                    'icp_relevance_reason' => is_array($lead->meta)
                        ? (trim((string) ($lead->meta['icp_relevance_reason'] ?? '')) ?: null)
                        : null,
                ]];
            }
        }

        return $payload;
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

    /**
     * @return Collection<int, Lead>
     */
    private function resolveLeadsForActivity(
        OutreachActivity $activity,
        Organization $organization,
        IcpProfile $icp,
    ): Collection {
        $meta = is_array($activity->meta) ? $activity->meta : [];
        $targetIds = collect($meta['target_lead_ids'] ?? [])
            ->filter(fn($id) => is_numeric($id))
            ->map(fn($id) => (int) $id)
            ->all();

        if ($targetIds !== []) {
            $leads = Lead::query()
                ->where('organization_id', $organization->id)
                ->whereIn('id', $targetIds)
                ->orderByDesc('score')
                ->get();

            if ($leads->isNotEmpty()) {
                return $leads;
            }
        }

        if ($activity->lead_id) {
            $lead = Lead::query()
                ->where('organization_id', $organization->id)
                ->find($activity->lead_id);

            if ($lead) {
                return collect([$lead]);
            }
        }

        return collect();
    }

    private function resolveLeadEmail(Lead $lead): ?string
    {
        if (! is_array($lead->meta)) {
            return null;
        }

        $email = trim((string) ($lead->meta['email'] ?? ''));

        return $email !== '' ? $email : null;
    }

    private function resolveSignalEmail(SocialSignal $signal): ?string
    {
        if ($signal->lead_id) {
            $lead = Lead::query()->find($signal->lead_id);
            if ($lead) {
                $email = $this->resolveLeadEmail($lead);
                if ($email) {
                    return $email;
                }
            }
        }

        $meta = is_array($signal->meta) ? $signal->meta : [];
        $email = trim((string) ($meta['email'] ?? $meta['author_email'] ?? ''));

        return $email !== '' ? $email : null;
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
        ?string $extraInstructions = null,
    ): string {
        if (! $this->glm->isConfigured()) {
            $names = collect($leads)->pluck('name')->implode(', ');
            $greeting = TimeGreeting::phrase($clientTimezone);
            $extra = $extraInstructions ? ' ' . $extraInstructions : '';

            return "{$greeting} — following up regarding {$icp->name}. " . ($names ? "Relevant accounts: {$names}. " : '') . trim($prompt) . $extra;
        }

        try {
            $system = "Draft a concise {$channel} outreach message for the user's specific request. Do not claim the message was sent. Professional tone for African B2B. " . TimeGreeting::promptContext($clientTimezone) . ' Use the active ICP industries, territories, and decision makers to tailor the angle. Reference the provided lead context when relevant. When prior chat turns are provided, keep continuity with that conversation. Output ONLY the sendable message body — no subject line, no "Subject:" header, no To/From headers, and no ICP analysis preamble.';

            if (filled($extraInstructions)) {
                $system .= ' Additional guidance from the user: ' . trim($extraInstructions);
            }

            $messages = [
                [
                    'role' => 'system',
                    'content' => $system,
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
                    'additional_instructions' => $extraInstructions,
                ], JSON_UNESCAPED_UNICODE),
            ];

            return $this->glm->chat($messages, 'outreach_draft', $organization);
        } catch (\Throwable) {
            return 'Draft outreach for ' . $icp->name . ': ' . $prompt;
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

    /**
     * Ensure email subject lives in the subject field and message body stays body-only.
     * Peels a leading "Subject: …" line when the model embeds it in the body.
     *
     * @return array{subject: ?string, body: string}
     */
    private function normalizeEmailParts(string $channel, string $body, ?string $fallbackSubject): array
    {
        $peeled = $this->peelSubjectFromBody($body);
        $cleanBody = $peeled['body'];

        if ($channel !== 'email') {
            return [
                'subject' => null,
                'body' => $cleanBody,
            ];
        }

        $subject = $peeled['subject'];
        if ($subject === null || $subject === '') {
            $subject = filled($fallbackSubject) ? trim((string) $fallbackSubject) : null;
        }

        return [
            'subject' => $subject !== '' ? $subject : null,
            'body' => $cleanBody,
        ];
    }

    /**
     * @return array{subject: ?string, body: string}
     */
    private function peelSubjectFromBody(string $body): array
    {
        $trimmed = trim($body);
        if (preg_match('/^\s*subject\s*:\s*(.+?)\s*(?:\r?\n)+([\s\S]*)$/i', $trimmed, $matches) === 1) {
            return [
                'subject' => trim((string) $matches[1]),
                'body' => trim((string) $matches[2]),
            ];
        }

        return [
            'subject' => null,
            'body' => $trimmed,
        ];
    }
}
