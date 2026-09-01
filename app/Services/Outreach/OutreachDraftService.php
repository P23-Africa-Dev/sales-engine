<?php

namespace App\Services\Outreach;

use App\Models\ChatMessage;
use App\Models\CompanyContact;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Support\TimeGreeting;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Collection;
use InvalidArgumentException;

class OutreachDraftService
{
    public function __construct(private readonly GlmClient $glm) {}

    /**
     * @return array{channel: string, subject?: string|null, body: string, sent: bool, leads?: list<array>, target_lead_ids: list<int>}
     */
    public function draftFromPrompt(
        Organization $organization,
        IcpProfile $icp,
        string $prompt,
        ?string $clientTimezone = null,
        ?int $chatSessionId = null,
    ): array {
        $channel = str_contains(mb_strtolower($prompt), 'whatsapp') ? 'whatsapp' : 'email';

        if ($channel === 'whatsapp') {
            $this->assertWhatsAppNotAutoSent();
        }

        $leads = $this->resolveLeads($organization, $icp, $chatSessionId);

        $body = $this->compose($organization, $icp, $prompt, $channel, $leads->all(), $clientTimezone);

        foreach ($leads as $lead) {
            OutreachActivity::query()->create([
                'organization_id' => $organization->id,
                'lead_id' => $lead->id,
                'company_id' => $lead->company_id,
                'name' => $lead->name,
                'channel' => $channel.' draft',
                'preview' => mb_substr($body, 0, 160),
                'accent_bg' => $channel === 'whatsapp' ? '#E8F8EF' : '#EEF2FF',
                'accent_icon' => $channel === 'whatsapp' ? '#16A34A' : '#4F46E5',
                'occurred_at' => now(),
                'meta' => ['sent' => false],
            ]);
        }

        return [
            'channel' => $channel,
            'subject' => $channel === 'email' ? 'Introduction — '.$icp->name : null,
            'body' => $body,
            'sent' => false,
            'target_lead_ids' => $leads->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'leads' => $leads->map(fn (Lead $l) => [
                'id' => $l->id,
                'name' => $l->name,
                'source' => $l->source,
                'score' => (int) round((float) $l->score),
                'summary' => $l->summary,
                'crm_synced' => filled($l->synced_to_f23_at),
                'f23_lead_id' => $l->f23_lead_id,
            ])->all(),
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
                    ->filter(fn ($id) => is_numeric($id))
                    ->map(fn ($id) => (int) $id)
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
     */
    private function compose(Organization $organization, IcpProfile $icp, string $prompt, string $channel, array $leads, ?string $clientTimezone = null): string
    {
        if (! $this->glm->isConfigured()) {
            $names = collect($leads)->pluck('name')->implode(', ');
            $greeting = TimeGreeting::phrase($clientTimezone);

            return "{$greeting} — following up regarding {$icp->name}. ".($names ? "Relevant accounts: {$names}. " : '').trim($prompt);
        }

        try {
            return $this->glm->chat([
                [
                    'role' => 'system',
                    'content' => "Draft a concise {$channel} outreach message for the user's specific request. Do not claim the message was sent. Professional tone for African B2B. ".TimeGreeting::promptContext($clientTimezone).' Reference the provided lead context when relevant.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'prompt' => $prompt,
                        'icp' => $icp->name,
                        'leads' => collect($leads)->map->only(['name', 'summary', 'score'])->all(),
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'outreach_draft', $organization);
        } catch (\Throwable) {
            return "Draft outreach for {$icp->name}: ".$prompt;
        }
    }
}
