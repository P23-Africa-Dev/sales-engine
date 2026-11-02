<?php

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use App\Models\CrmActivity;
use App\Models\CrmEntry;
use App\Models\CrmNote;
use App\Models\CrmStage;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminCrmService
{
    public function __construct(
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function overview(?int $organizationId = null): array
    {
        $entries = CrmEntry::query()
            ->with(['stage', 'lead'])
            ->when($organizationId, fn (Builder $q) => $q->where('organization_id', $organizationId));

        $total = (clone $entries)->count();
        $archived = (clone $entries)->whereNotNull('archived_at')->count();
        $open = (clone $entries)->whereNull('archived_at')->whereHas('stage', function (Builder $q) {
            $q->whereNotIn('slug', ['won', 'lost']);
        })->count();
        $won = (clone $entries)->whereNull('archived_at')->whereHas('stage', fn (Builder $q) => $q->where('slug', 'won'))->count();
        $lost = (clone $entries)->whereNull('archived_at')->whereHas('stage', fn (Builder $q) => $q->where('slug', 'lost'))->count();
        $closed = $won + $lost;
        $winRate = $closed ? (int) round($won / $closed * 100) : 0;

        $unassigned = (clone $entries)->whereNull('archived_at')->whereNull('assigned_to_user_id')->count();
        $missingEmail = (clone $entries)->whereNull('archived_at')->whereHas('lead', function (Builder $q) {
            $q->where(function (Builder $inner) {
                $inner->whereNull('meta->email')->orWhere('meta->email', '');
            });
        })->count();
        $duplicates = (clone $entries)->whereNull('archived_at')->whereHas('lead', function (Builder $q) {
            $q->whereNotNull('crm_duplicate_of');
        })->count();

        $staleDays = $organizationId
            ? (int) (Organization::query()->whereKey($organizationId)->value('crm_stale_days') ?? 7)
            : 7;

        $stale = (clone $entries)
            ->whereNull('archived_at')
            ->whereHas('stage', fn (Builder $q) => $q->whereNotIn('slug', ['won', 'lost']))
            ->where('updated_at', '<', now()->subDays($staleDays))
            ->count();

        return [
            'totals' => [
                'entries' => $total,
                'open' => $open,
                'won' => $won,
                'lost' => $lost,
                'archived' => $archived,
                'win_rate' => $winRate,
            ],
            'quality_flags' => [
                'unassigned' => $unassigned,
                'missing_email' => $missingEmail,
                'possible_duplicates' => $duplicates,
                'stale' => $stale,
                'stale_days' => $staleDays,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function paginateEntries(array $filters): LengthAwarePaginator
    {
        $query = CrmEntry::query()->with(['lead.company', 'pipeline', 'stage', 'assignee', 'creator', 'organization']);

        if (! empty($filters['organization_id'])) {
            $query->where('organization_id', (int) $filters['organization_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->whereHas('lead', function (Builder $q) use ($term) {
                $q->where('name', 'like', $term)
                    ->orWhere('meta->email', 'like', $term)
                    ->orWhere('meta->company', 'like', $term);
            });
        }

        if (! empty($filters['stage_id'])) {
            $query->where('stage_id', (int) $filters['stage_id']);
        }

        if (! empty($filters['stage_slug'])) {
            $query->whereHas('stage', fn (Builder $q) => $q->where('slug', $filters['stage_slug']));
        }

        if (($filters['archived'] ?? null) === 'only') {
            $query->whereNotNull('archived_at');
        } elseif (($filters['archived'] ?? 'exclude') !== 'include') {
            $query->whereNull('archived_at');
        }

        if (! empty($filters['assignee_id'])) {
            $query->where('assigned_to_user_id', (int) $filters['assignee_id']);
        }

        $sort = (string) ($filters['sort'] ?? 'newest');
        match ($sort) {
            'oldest' => $query->orderBy('updated_at')->orderBy('id'),
            'value_desc' => $query->orderByDesc('budget_amount')->orderByDesc('id'),
            'value_asc' => $query->orderBy('budget_amount')->orderBy('id'),
            default => $query->orderByDesc('updated_at')->orderByDesc('id'),
        };

        $perPage = min(100, max(1, (int) ($filters['per_page'] ?? 20)));

        return $query->paginate($perPage);
    }

    public function findEntry(int $id): CrmEntry
    {
        return CrmEntry::query()
            ->with(['lead.company', 'pipeline', 'stage', 'assignee', 'creator', 'organization'])
            ->findOrFail($id);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateEntry(PlatformAdmin $admin, CrmEntry $entry, array $data): CrmEntry
    {
        $reason = (string) ($data['reason'] ?? '');
        if (trim($reason) === '') {
            throw ValidationException::withMessages(['reason' => 'A reason is required.']);
        }

        if (array_key_exists('assigned_to_user_id', $data)) {
            $entry->assigned_to_user_id = $data['assigned_to_user_id'];
        }

        if (! empty($data['stage_id'])) {
            $stage = CrmStage::query()
                ->where('organization_id', $entry->organization_id)
                ->whereKey((int) $data['stage_id'])
                ->firstOrFail();
            $entry->stage_id = $stage->id;
            if ($entry->lead) {
                $entry->lead->stage = $stage->slug;
                $entry->lead->save();
            }
        }

        if ($entry->lead && (array_key_exists('email', $data) || array_key_exists('phone', $data) || array_key_exists('name', $data))) {
            $meta = $entry->lead->meta ?? [];
            if (array_key_exists('email', $data)) {
                $meta['email'] = $data['email'];
            }
            if (array_key_exists('phone', $data)) {
                $meta['phone'] = $data['phone'];
            }
            if (array_key_exists('name', $data) && filled($data['name'])) {
                $entry->lead->name = (string) $data['name'];
            }
            $entry->lead->meta = $meta;
            $entry->lead->save();
        }

        if (array_key_exists('budget_amount', $data)) {
            $entry->budget_amount = $data['budget_amount'];
        }

        if (array_key_exists('priority', $data)) {
            $entry->priority = $data['priority'];
        }

        $entry->save();

        $this->audit->log(
            $admin,
            'CRM entry updated',
            $reason,
            $entry->organization_id,
            $entry,
            ['changes' => array_keys($data)],
        );

        return $this->findEntry($entry->id);
    }

    /**
     * @param  list<int>  $ids
     * @return array{updated: int}
     */
    public function archive(PlatformAdmin $admin, array $ids, string $reason): array
    {
        $entries = CrmEntry::query()->whereIn('id', $ids)->get();
        $updated = 0;

        foreach ($entries as $entry) {
            $entry->archived_at = now();
            $entry->save();
            $updated++;
            $this->audit->log($admin, 'CRM entry archived', $reason, $entry->organization_id, $entry);
        }

        return ['updated' => $updated];
    }

    /**
     * @param  list<int>  $ids
     * @return array{updated: int}
     */
    public function restore(PlatformAdmin $admin, array $ids, string $reason): array
    {
        $entries = CrmEntry::query()->whereIn('id', $ids)->get();
        $updated = 0;

        foreach ($entries as $entry) {
            $entry->archived_at = null;
            $entry->save();
            $updated++;
            $this->audit->log($admin, 'CRM entry restored', $reason, $entry->organization_id, $entry);
        }

        return ['updated' => $updated];
    }

    public function addNote(PlatformAdmin $admin, CrmEntry $entry, string $note, ?string $reason = null): CrmNote
    {
        $row = CrmNote::query()->create([
            'organization_id' => $entry->organization_id,
            'lead_id' => $entry->lead_id,
            'created_by_user_id' => null,
            'note' => '[Admin] '.$note,
        ]);

        $this->audit->log(
            $admin,
            'CRM entry note added',
            $reason ?? $note,
            $entry->organization_id,
            $entry,
            ['note_id' => $row->id],
        );

        return $row;
    }

    public function dismissDuplicate(PlatformAdmin $admin, CrmEntry $entry, string $reason): CrmEntry
    {
        $lead = $entry->lead;
        if (! $lead) {
            throw ValidationException::withMessages(['entry' => 'CRM entry has no lead.']);
        }

        $lead->crm_duplicate_of = null;
        $lead->crm_duplicate_reason = null;
        $meta = $lead->meta ?? [];
        $meta['admin_duplicate_dismissed_at'] = now()->toIso8601String();
        $meta['admin_duplicate_dismissed_reason'] = $reason;
        $lead->meta = $meta;
        $lead->save();

        $this->audit->log(
            $admin,
            'CRM duplicate dismissed',
            $reason,
            $entry->organization_id,
            $entry,
        );

        return $this->findEntry($entry->id);
    }

    public function completeFollowUp(PlatformAdmin $admin, CrmEntry $entry, string $reason): CrmActivity
    {
        $activity = CrmActivity::query()->create([
            'organization_id' => $entry->organization_id,
            'lead_id' => $entry->lead_id,
            'created_by_user_id' => null,
            'type' => 'follow_up_completed',
            'title' => 'Follow-up completed by admin',
            'description' => $reason,
            'happened_at' => now(),
            'meta' => ['admin_id' => $admin->id],
        ]);

        $this->audit->log(
            $admin,
            'CRM follow-up completed',
            $reason,
            $entry->organization_id,
            $entry,
            ['activity_id' => $activity->id],
        );

        return $activity;
    }

    /**
     * @return array{crm_stale_days: int}
     */
    public function reviewPolicy(Organization $organization): array
    {
        return ['crm_stale_days' => (int) ($organization->crm_stale_days ?? 7)];
    }

    /**
     * @return array{crm_stale_days: int}
     */
    public function updateReviewPolicy(PlatformAdmin $admin, Organization $organization, int $days, ?string $reason = null): array
    {
        $organization->crm_stale_days = $days;
        $organization->save();

        $this->audit->log(
            $admin,
            'CRM review policy updated',
            $reason ?? "Set CRM stale days to {$days}.",
            $organization->id,
            $organization,
            ['crm_stale_days' => $days],
        );

        return $this->reviewPolicy($organization->fresh());
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function exportEntries(array $filters): StreamedResponse
    {
        $filters['per_page'] = 10000;
        $page = $this->paginateEntries($filters);

        return response()->streamDownload(function () use ($page) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['id', 'organization_id', 'lead_name', 'email', 'stage', 'budget_amount', 'assignee', 'archived_at', 'updated_at']);
            foreach ($page->items() as $entry) {
                /** @var CrmEntry $entry */
                fputcsv($out, [
                    $entry->id,
                    $entry->organization_id,
                    $entry->lead?->name,
                    $entry->lead?->meta['email'] ?? null,
                    $entry->stage?->slug,
                    $entry->budget_amount,
                    $entry->assignee?->name,
                    $entry->archived_at?->toIso8601String(),
                    $entry->updated_at?->toIso8601String(),
                ]);
            }
            fclose($out);
        }, 'admin-crm-entries.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{follow_ups: list<array<string, mixed>>, audits: list<array<string, mixed>>}
     */
    public function activity(array $filters): array
    {
        $orgId = isset($filters['organization_id']) ? (int) $filters['organization_id'] : null;
        $limit = min(100, max(1, (int) ($filters['limit'] ?? 50)));

        $followUps = CrmActivity::query()
            ->when($orgId, fn (Builder $q) => $q->where('organization_id', $orgId))
            ->where('type', 'follow_up_completed')
            ->orderByDesc('happened_at')
            ->limit($limit)
            ->get()
            ->map(fn (CrmActivity $activity) => [
                'id' => $activity->id,
                'organization_id' => $activity->organization_id,
                'lead_id' => $activity->lead_id,
                'title' => $activity->title,
                'description' => $activity->description,
                'happened_at' => ($activity->happened_at ?? $activity->created_at)?->toIso8601String(),
            ])
            ->values()
            ->all();

        $audits = AdminAuditEvent::query()
            ->with('admin')
            ->when($orgId, fn (Builder $q) => $q->where('organization_id', $orgId))
            ->where('action', 'like', 'CRM%')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->map(fn (AdminAuditEvent $event) => [
                'id' => $event->id,
                'action' => $event->action,
                'reason' => $event->reason,
                'organization_id' => $event->organization_id,
                'admin' => $event->admin?->name,
                'created_at' => $event->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        return [
            'follow_ups' => $followUps,
            'audits' => $audits,
        ];
    }
}
