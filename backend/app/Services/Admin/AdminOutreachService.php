<?php

namespace App\Services\Admin;

use App\Models\AdminOrganizationNote;
use App\Models\CallLog;
use App\Models\CrmActivity;
use App\Models\CrmNote;
use App\Models\InboundEmail;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\PlatformAdmin;
use App\Services\Voice\VoiceCallService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class AdminOutreachService
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
        private readonly VoiceCallService $voice,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function dashboard(?int $organizationId = null): array
    {
        $activities = OutreachActivity::query()
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId));

        $emailTotal = (clone $activities)->whereIn('channel', ['email', 'email draft'])->count();
        $emailSent = (clone $activities)->whereIn('channel', ['email', 'email draft'])->whereNotNull('sent_at')->count();
        $smsTotal = (clone $activities)->whereIn('channel', ['sms', 'sms draft'])->count();
        $smsSent = (clone $activities)->whereIn('channel', ['sms', 'sms draft'])->whereNotNull('sent_at')->count();
        $smsDelivered = (clone $activities)->whereIn('channel', ['sms', 'sms draft'])->where('delivery_status', 'delivered')->count();

        $inboundConfigured = trim((string) config('services.sendgrid.inbound_domain')) !== '';
        $received = $inboundConfigured
            ? InboundEmail::query()->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))->count()
            : null;

        $voiceConfigured = $this->voice->isConfigured();
        $voiceIncoming = $voiceConfigured
            ? CallLog::query()->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))->where('direction', 'inbound')->count()
            : null;
        $voiceOutgoing = $voiceConfigured
            ? CallLog::query()->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))->where('direction', 'outbound')->count()
            : null;
        $voiceTotal = $voiceConfigured ? (int) $voiceIncoming + (int) $voiceOutgoing : null;

        $metric = function (string $id, string $title, ?int $total, string $primary, string $secondary, ?int $percent): array {
            return [
                'id' => $id,
                'title' => $title,
                'total' => $total,
                'primaryLabel' => $primary,
                'secondaryLabel' => $secondary,
                'primaryPercent' => $percent,
                'secondaryPercent' => null,
            ];
        };

        $emailMetric = array_merge($metric(
            'email',
            'No of Emails',
            $emailTotal,
            'Sent',
            $inboundConfigured ? 'Received' : 'Received unavailable',
            $emailTotal ? (int) round($emailSent / $emailTotal * 100) : 0,
        ), [
            'primaryCount' => $emailSent,
            'secondaryCount' => $received,
            'secondaryPercent' => $emailTotal && $received ? (int) round($received / $emailTotal * 100) : null,
        ]);

        $smsMetric = array_merge($metric(
            'sms',
            'No of SMS',
            $smsTotal,
            'Sent',
            'Delivered',
            $smsTotal ? (int) round($smsSent / $smsTotal * 100) : 0,
        ), [
            'primaryCount' => $smsSent,
            'secondaryCount' => $smsDelivered,
            'secondaryPercent' => $smsTotal ? (int) round($smsDelivered / $smsTotal * 100) : 0,
        ]);

        $voiceMetric = array_merge($metric(
            'voice-calls',
            'Number of Voice Calls',
            $voiceTotal,
            'Incoming',
            'Outgoing',
            $voiceTotal ? (int) round(((int) $voiceIncoming) / $voiceTotal * 100) : 0,
        ), [
            'configured' => $voiceConfigured,
            'primaryCount' => $voiceIncoming,
            'secondaryCount' => $voiceOutgoing,
            'secondaryPercent' => $voiceTotal ? (int) round(((int) $voiceOutgoing) / $voiceTotal * 100) : null,
        ]);

        return [
            'source' => 'live',
            'counts' => [
                'outreach' => (clone $activities)->count(),
                'organizations' => Organization::query()
                    ->when($organizationId, fn (Builder $q) => $q->whereKey($organizationId))
                    ->count(),
            ],
            'metrics' => [$emailMetric, $smsMetric, $voiceMetric],
            'supported_channels' => ['email', 'whatsapp', 'sms'],
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function organizationRollups(?int $organizationId = null): Collection
    {
        $orgs = Organization::query()
            ->when($organizationId, fn (Builder $q) => $q->whereKey($organizationId))
            ->with(['users' => fn ($q) => $q->wherePivot('role', 'owner')])
            ->withCount([
                'leads as prospects_count',
                'companies as companies_count',
            ])
            ->orderBy('name')
            ->get();

        $emailsSent = OutreachActivity::query()
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))
            ->whereIn('channel', ['email', 'email draft'])
            ->whereNotNull('sent_at')
            ->select('organization_id')
            ->selectRaw('count(*) as total')
            ->groupBy('organization_id')
            ->pluck('total', 'organization_id');

        $followUps = CrmActivity::query()
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId))
            ->where('type', 'follow_up_completed')
            ->select('organization_id')
            ->selectRaw('count(*) as total')
            ->groupBy('organization_id')
            ->pluck('total', 'organization_id');

        return $orgs->map(function (Organization $org) use ($emailsSent, $followUps) {
            $owner = $org->users->first();

            return [
                'organization_id' => $org->id,
                'name' => $org->name,
                'status' => $org->status ?? 'active',
                'industry' => $org->industry,
                'country' => $org->country,
                'website' => null,
                'owner' => $owner?->name,
                'owner_email' => $owner?->email,
                'created_at' => $org->created_at?->toIso8601String(),
                'emails_sent' => (int) ($emailsSent[$org->id] ?? 0),
                'prospects' => (int) $org->prospects_count,
                'companies' => (int) $org->companies_count,
                'follow_ups_completed' => (int) ($followUps[$org->id] ?? 0),
            ];
        })->values();
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginateActivities(array $filters): LengthAwarePaginator
    {
        $query = OutreachActivity::query()->with(['organization', 'user', 'lead']);

        if (! empty($filters['organization_id'])) {
            $query->where('organization_id', (int) $filters['organization_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(fn (Builder $q) => $q->where('name', 'like', $term)->orWhere('preview', 'like', $term));
        }

        if (! empty($filters['channel']) && $filters['channel'] !== 'all') {
            $channel = (string) $filters['channel'];
            $query->whereIn('channel', [$channel, $channel.' draft']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $status = (string) $filters['status'];
            if ($status === 'draft') {
                $query->whereNull('delivery_status')->whereNull('sent_at');
            } elseif ($status === 'sent') {
                $query->where(function (Builder $inner) {
                    $inner->where('delivery_status', 'sent')
                        ->orWhere(fn (Builder $sent) => $sent->whereNull('delivery_status')->whereNotNull('sent_at'));
                });
            } else {
                $query->where('delivery_status', $status);
            }
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        return $query->orderByDesc('updated_at')->orderByDesc('id')->paginate($perPage);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function timeline(Organization $organization): array
    {
        $items = [];

        OutreachActivity::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('updated_at')
            ->limit(100)
            ->get()
            ->each(function (OutreachActivity $activity) use (&$items) {
                $items[] = [
                    'id' => 'outreach:'.$activity->id,
                    'type' => 'outreach',
                    'title' => $activity->name,
                    'channel' => str_replace(' draft', '', $activity->channel),
                    'status' => $activity->delivery_status ?? ($activity->sent_at ? 'sent' : 'draft'),
                    'body' => $activity->preview,
                    'occurred_at' => ($activity->occurred_at ?? $activity->created_at)?->toIso8601String(),
                ];
            });

        CrmNote::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->each(function (CrmNote $note) use (&$items) {
                $items[] = [
                    'id' => 'crm_note:'.$note->id,
                    'type' => 'note',
                    'title' => 'CRM note',
                    'channel' => 'note',
                    'status' => null,
                    'body' => $note->note,
                    'occurred_at' => $note->created_at?->toIso8601String(),
                ];
            });

        CrmActivity::query()
            ->where('organization_id', $organization->id)
            ->orderByDesc('happened_at')
            ->limit(100)
            ->get()
            ->each(function (CrmActivity $activity) use (&$items) {
                $items[] = [
                    'id' => 'crm_activity:'.$activity->id,
                    'type' => $activity->type,
                    'title' => $activity->title ?? $activity->type,
                    'channel' => 'crm',
                    'status' => null,
                    'body' => $activity->description,
                    'occurred_at' => ($activity->happened_at ?? $activity->created_at)?->toIso8601String(),
                ];
            });

        AdminOrganizationNote::query()
            ->with('admin')
            ->where('organization_id', $organization->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->each(function (AdminOrganizationNote $note) use (&$items) {
                $items[] = [
                    'id' => 'admin_note:'.$note->id,
                    'type' => 'admin_note',
                    'title' => 'Admin note',
                    'channel' => 'admin',
                    'status' => null,
                    'body' => $note->note,
                    'author' => $note->admin?->name,
                    'occurred_at' => $note->created_at?->toIso8601String(),
                ];
            });

        if (trim((string) config('services.sendgrid.inbound_domain')) !== '') {
            InboundEmail::query()
                ->where('organization_id', $organization->id)
                ->orderByDesc('created_at')
                ->limit(50)
                ->get()
                ->each(function (InboundEmail $email) use (&$items) {
                    $items[] = [
                        'id' => 'inbound:'.$email->id,
                        'type' => 'inbound_email',
                        'title' => $email->subject ?? 'Inbound email',
                        'channel' => 'email',
                        'status' => 'received',
                        'body' => $email->body_text ? mb_substr($email->body_text, 0, 240) : null,
                        'occurred_at' => $email->created_at?->toIso8601String(),
                    ];
                });
        }

        usort($items, fn (array $a, array $b) => strcmp((string) ($b['occurred_at'] ?? ''), (string) ($a['occurred_at'] ?? '')));

        return array_values($items);
    }

    public function addAdminNote(PlatformAdmin $admin, Organization $organization, string $note): AdminOrganizationNote
    {
        $row = AdminOrganizationNote::query()->create([
            'organization_id' => $organization->id,
            'platform_admin_id' => $admin->id,
            'note' => $note,
        ]);

        $this->audit->log(
            $admin,
            'Organization admin note added',
            $note,
            $organization->id,
            $organization,
            ['note_id' => $row->id],
        );

        return $row->load('admin');
    }
}
