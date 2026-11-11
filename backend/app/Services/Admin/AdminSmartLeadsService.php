<?php

namespace App\Services\Admin;

use App\Models\Lead;
use App\Models\Organization;
use App\Models\OutreachActivity;
use App\Models\PlatformAdmin;
use App\Models\SocialSignal;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

class AdminSmartLeadsService
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
    ) {}

    public static function tier(?float $score): string
    {
        $value = (float) ($score ?? 0);

        if ($value >= 75) {
            return 'high';
        }

        if ($value >= 50) {
            return 'middle';
        }

        return 'low';
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginateLeads(Organization $organization, array $filters): LengthAwarePaginator
    {
        $query = Lead::query()
            ->with(['company', 'crmEntry', 'icpProfile'])
            ->where('organization_id', $organization->id)
            ->where('save_status', '!=', Lead::SAVE_REJECTED);

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(function (Builder $builder) use ($term) {
                $builder->where('name', 'like', $term)
                    ->orWhere('summary', 'like', $term)
                    ->orWhere('source', 'like', $term)
                    ->orWhereHas('company', fn (Builder $company) => $company->where('name', 'like', $term));
            });
        }

        if (! empty($filters['tier']) && $filters['tier'] !== 'all') {
            match ($filters['tier']) {
                'high' => $query->where('score', '>=', 75),
                'middle' => $query->whereBetween('score', [50, 74.999]),
                'low' => $query->where(fn (Builder $q) => $q->whereNull('score')->orWhere('score', '<', 50)),
                default => null,
            };
        }

        if (isset($filters['min_score'])) {
            $query->where('score', '>=', (float) $filters['min_score']);
        }

        if (isset($filters['max_score'])) {
            $query->where('score', '<=', (float) $filters['max_score']);
        }

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        return $query->orderByDesc('score')->orderByDesc('id')->paginate($perPage);
    }

    public function findLead(int $leadId): Lead
    {
        return Lead::query()
            ->with([
                'company',
                'crmEntry.stage',
                'crmEntry.assignee',
                'icpProfile',
                'organization',
                'outreachActivities' => fn ($q) => $q->orderByDesc('id')->limit(20),
            ])
            ->findOrFail($leadId);
    }

    /**
     * @return array<string, mixed>
     */
    public function leadDetail(Lead $lead): array
    {
        $meta = $lead->meta ?? [];
        $signals = SocialSignal::query()
            ->where('organization_id', $lead->organization_id)
            ->where(function (Builder $q) use ($lead) {
                $q->where('lead_id', $lead->id);
                if ($lead->company_id) {
                    $q->orWhere('company_name', $lead->company?->name);
                }
            })
            ->orderByDesc('score')
            ->limit(20)
            ->get()
            ->map(fn (SocialSignal $signal) => [
                'id' => $signal->id,
                'source' => $signal->source_label,
                'intent_label' => $signal->intent_label,
                'score' => $signal->score,
                'status' => $signal->status,
                'posted_at' => $signal->posted_at?->toIso8601String(),
                'summary' => $signal->summary ?? $signal->post_text,
            ])
            ->values()
            ->all();

        return [
            'lead' => $lead,
            'contacts' => [[
                'name' => $lead->name,
                'title' => $meta['title'] ?? null,
                'email' => $meta['email'] ?? null,
                'phone' => $meta['phone'] ?? null,
                'linkedin' => $meta['linkedin_url'] ?? null,
                'verified' => filled($meta['email'] ?? null) || filled($meta['phone'] ?? null),
            ]],
            'signals' => $signals,
            'activities' => $lead->outreachActivities->map(fn (OutreachActivity $activity) => [
                'id' => $activity->id,
                'name' => $activity->name,
                'channel' => str_replace(' draft', '', $activity->channel),
                'status' => $activity->delivery_status ?? ($activity->sent_at ? 'sent' : 'draft'),
                'occurred_at' => ($activity->occurred_at ?? $activity->created_at)?->toIso8601String(),
            ])->values()->all(),
            'tier' => self::tier($lead->score),
        ];
    }

    public function addNote(PlatformAdmin $admin, Lead $lead, string $note, ?string $reason = null): void
    {
        $meta = $lead->meta ?? [];
        $notes = is_array($meta['admin_notes'] ?? null) ? $meta['admin_notes'] : [];
        $notes[] = [
            'note' => $note,
            'reason' => $reason,
            'admin_id' => $admin->id,
            'admin_name' => $admin->name,
            'created_at' => now()->toIso8601String(),
        ];
        $meta['admin_notes'] = $notes;
        $lead->meta = $meta;
        $lead->save();

        $this->audit->log(
            $admin,
            'Lead admin note added',
            $reason ?? $note,
            $lead->organization_id,
            $lead,
            ['note' => $note],
        );
    }

    /**
     * @param  list<int>  $leadIds
     * @return list<int>
     */
    public function prepareOutreach(PlatformAdmin $admin, array $leadIds, string $sequence): array
    {
        $updated = [];
        $leads = Lead::query()->whereIn('id', $leadIds)->get();

        foreach ($leads as $lead) {
            $meta = $lead->meta ?? [];
            $meta['admin_outreach_prepared'] = true;
            $meta['admin_outreach_sequence'] = $sequence;
            $meta['admin_outreach_prepared_at'] = now()->toIso8601String();
            $meta['admin_outreach_prepared_by'] = $admin->id;
            $lead->meta = $meta;
            $lead->save();
            $updated[] = (int) $lead->id;

            $this->audit->log(
                $admin,
                'Lead prepared for outreach',
                'Marked lead for client outreach sequence.',
                $lead->organization_id,
                $lead,
                ['sequence' => $sequence],
            );
        }

        return $updated;
    }

    /**
     * @return array<string, mixed>
     */
    public function analytics(Organization $organization): array
    {
        $leads = Lead::query()
            ->where('organization_id', $organization->id)
            ->where('save_status', '!=', Lead::SAVE_REJECTED)
            ->get(['id', 'score', 'meta']);

        $total = $leads->count();
        $high = $leads->filter(fn (Lead $lead) => self::tier($lead->score) === 'high')->count();
        $middle = $leads->filter(fn (Lead $lead) => self::tier($lead->score) === 'middle')->count();
        $low = $leads->filter(fn (Lead $lead) => self::tier($lead->score) === 'low')->count();
        $avg = $total ? round((float) $leads->avg(fn (Lead $lead) => (float) ($lead->score ?? 0)), 1) : 0.0;

        $signals = SocialSignal::query()
            ->where('organization_id', $organization->id)
            ->whereNotIn('status', SocialSignal::HIDDEN_STATUSES)
            ->get(['signal_type_key', 'signal_type', 'intent_label']);

        $breakdown = [
            'hiring' => 0,
            'funding' => 0,
            'expansion' => 0,
            'tenders' => 0,
        ];

        foreach ($signals as $signal) {
            $key = strtolower((string) ($signal->signal_type_key ?? $signal->signal_type ?? $signal->intent_label ?? ''));
            if (str_contains($key, 'hir')) {
                $breakdown['hiring']++;
            } elseif (str_contains($key, 'fund')) {
                $breakdown['funding']++;
            } elseif (str_contains($key, 'expand') || str_contains($key, 'expansion')) {
                $breakdown['expansion']++;
            } elseif (str_contains($key, 'tender') || str_contains($key, 'rfp')) {
                $breakdown['tenders']++;
            }
        }

        $verified = $leads->filter(function (Lead $lead) {
            $meta = $lead->meta ?? [];

            return filled($meta['email'] ?? null) || filled($meta['phone'] ?? null);
        })->count();

        $velocity = [];
        for ($offset = 13; $offset >= 0; $offset--) {
            $day = Carbon::now()->startOfDay()->subDays($offset);
            $start = $day->copy()->startOfDay();
            $end = $day->copy()->endOfDay();
            $touches = OutreachActivity::query()
                ->where('organization_id', $organization->id)
                ->whereBetween('created_at', [$start, $end])
                ->count();
            $opens = OutreachActivity::query()
                ->where('organization_id', $organization->id)
                ->whereIn('delivery_status', ['opened', 'clicked'])
                ->whereBetween('last_event_at', [$start, $end])
                ->count();

            $velocity[] = [
                'day' => $day->toDateString(),
                'day_label' => $offset === 0 ? 'Today' : $day->format('D'),
                'dayLabel' => $offset === 0 ? 'Today' : $day->format('D'),
                'touches' => $touches,
                'opens' => $opens,
                'replies' => 0,
                'meetings' => 0,
            ];
        }

        return [
            'total' => $total,
            'total_prospects' => $total,
            'avg_score' => $avg,
            'avg_fit_score' => $avg,
            'tier_distribution' => [
                'high' => $high,
                'middle' => $middle,
                'low' => $low,
            ],
            'high_tier_count' => $high,
            'middle_tier_count' => $middle,
            'low_tier_count' => $low,
            'high_tier_percent' => $total ? (int) round($high / $total * 100) : 0,
            'middle_tier_percent' => $total ? (int) round($middle / $total * 100) : 0,
            'low_tier_percent' => $total ? (int) round($low / $total * 100) : 0,
            'buying_signals_count' => $signals->count(),
            'buying_signal_coverage' => $breakdown,
            'signal_breakdown' => $breakdown,
            'verified_contact_rate' => $total ? (int) round($verified / $total * 100) : 0,
            'outreach_velocity' => $velocity,
        ];
    }
}
