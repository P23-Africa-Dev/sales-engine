<?php

namespace App\Services\Outreach;

use App\Models\CompanyContact;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Services\Llm\GlmClient;
use InvalidArgumentException;

class OutreachDraftService
{
    public function __construct(private readonly GlmClient $glm) {}

    /**
     * @return array{channel: string, subject?: string|null, body: string, leads?: list<array>}
     */
    public function draftFromPrompt(Organization $organization, IcpProfile $icp, string $prompt): array
    {
        $channel = str_contains(mb_strtolower($prompt), 'whatsapp') ? 'whatsapp' : 'email';

        if ($channel === 'whatsapp') {
            // Never auto-send; drafting only. Opt-in gate for any future send path.
            $this->assertWhatsAppNotAutoSent();
        }

        $leads = Lead::query()
            ->where('organization_id', $organization->id)
            ->where('icp_profile_id', $icp->id)
            ->orderByDesc('score')
            ->limit(3)
            ->get();

        $body = $this->compose($organization, $icp, $prompt, $channel, $leads->all());

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
            'leads' => $leads->map(fn (Lead $l) => [
                'id' => $l->id,
                'name' => $l->name,
                'source' => $l->source,
                'score' => (int) round((float) $l->score),
                'summary' => $l->summary,
            ])->all(),
        ];
    }

    /**
     * Send path guard — WhatsApp must never send without contact opt-in.
     */
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
    private function compose(Organization $organization, IcpProfile $icp, string $prompt, string $channel, array $leads): string
    {
        if (! $this->glm->isConfigured()) {
            $names = collect($leads)->pluck('name')->implode(', ');

            return "Hi — following up regarding {$icp->name}. ".($names ? "Relevant accounts: {$names}. " : '').trim($prompt);
        }

        try {
            return $this->glm->chat([
                [
                    'role' => 'system',
                    'content' => "Draft a concise {$channel} outreach message. Do not claim the message was sent. Professional tone for African B2B.",
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
