<?php

namespace App\Services\Crm;

use App\Models\CrmEntry;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Intent\SignalToLeadService;
use App\Support\OrgContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NativeCrmService
{
    public const STAGES = ['new' => ['New Lead', '#2563EB'], 'contacted' => ['Contacted', '#E879A0'], 'engaged' => ['Engaged', '#F59E0B'], 'qualified' => ['Qualified', '#10B981'], 'won' => ['Won', '#059669'], 'lost' => ['Lost', '#EF4444']];

    public function initialize(): void
    {
        $org = OrgContext::require();
        DB::transaction(function () use ($org) {
            Organization::query()->whereKey($org->id)->lockForUpdate()->firstOrFail();
            if (! CrmPipeline::query()->where('organization_id', $org->id)->exists()) {
                CrmPipeline::query()->create(['organization_id' => $org->id, 'name' => 'Default Pipeline', 'is_default' => true]);
            }
            if (! CrmStage::query()->where('organization_id', $org->id)->exists()) {
                foreach (self::STAGES as $slug => [$name, $color]) {
                    CrmStage::query()->create(['organization_id' => $org->id, 'name' => $name, 'slug' => $slug, 'color' => $color, 'sort_order' => array_search($slug, array_keys(self::STAGES)), 'is_default' => $slug === 'new']);
                }
            }
        });
    }

    public function pipelines(): Builder
    {
        return CrmPipeline::query()->where('organization_id', OrgContext::require()->id);
    }

    public function stages(): Builder
    {
        return CrmStage::query()->where('organization_id', OrgContext::require()->id);
    }

    public function entries(): Builder
    {
        return CrmEntry::query()->where('organization_id', OrgContext::require()->id)->with(['lead.company', 'pipeline', 'stage', 'creator', 'assignee']);
    }

    public function entry(int $id): CrmEntry
    {
        return $this->entries()->where('lead_id', $id)->firstOrFail();
    }

    public function resolvePipeline(?int $id, User $user): CrmPipeline
    {
        $this->initialize();
        if ($id !== null) {
            $pipeline = $this->pipelines()->find($id);
            if (! $pipeline) {
                throw ValidationException::withMessages(['pipeline_id' => 'Choose a pipeline belonging to your organization.']);
            }

            return $pipeline;
        }
        $preferred = DB::table('crm_preferences')->where('organization_id', OrgContext::require()->id)->where('user_id', $user->id)->value('pipeline_id');

        return ($preferred ? $this->pipelines()->find($preferred) : null) ?? $this->pipelines()->orderByDesc('is_default')->orderBy('sort_order')->firstOrFail();
    }

    public function identity(Lead $lead): ?string
    {
        $meta = $lead->meta ?? [];
        $email = strtolower(trim((string) ($meta['email'] ?? '')));
        if ($email !== '') {
            return 'email:'.$email;
        }
        $profile = trim((string) ($meta['linkedin_url'] ?? $meta['author_profile_url'] ?? ''));
        if ($profile !== '') {
            return 'profile:'.strtolower(rtrim($profile, '/'));
        }
        $phone = preg_replace('/[^0-9+]/', '', (string) ($meta['phone'] ?? ''));

        return $phone !== '' ? 'phone:'.$phone : null;
    }

    public function saveDiscovery(int $id, ?int $pipelineId, User $user): array
    {
        $pipeline = $this->resolvePipeline($pipelineId, $user);

        return DB::transaction(function () use ($id, $pipeline, $user) {
            $org = OrgContext::require();
            Organization::query()->whereKey($org->id)->lockForUpdate()->firstOrFail();
            $lead = Lead::query()->where('organization_id', $org->id)->lockForUpdate()->findOrFail($id);
            $existing = $this->entries()->where('lead_id', $lead->id)->first();
            $key = $this->identity($lead);
            $duplicate = ! $existing && $key ? $this->entries()->where('identity_key', $key)->first() : null;
            $entry = $existing ?? $duplicate;
            if (! $entry) {
                $stage = $this->stages()->where('slug', $lead->stage)->first() ?? $this->stages()->orderByDesc('is_default')->orderBy('sort_order')->firstOrFail();
                $entry = CrmEntry::query()->create(['organization_id' => $org->id, 'lead_id' => $lead->id, 'pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'created_by_user_id' => $user->id, 'identity_key' => $key]);
            } elseif ($duplicate) {
                $canonical = $entry->lead;
                $merged = $canonical->meta ?? [];
                foreach ($lead->meta ?? [] as $field => $value) {
                    if (blank($merged[$field] ?? null) && filled($value)) {
                        $merged[$field] = $value;
                    }
                }
                $canonical->update(['meta' => $merged]);
                $meta = $lead->meta ?? [];
                $meta['native_crm_lead_id'] = $entry->lead_id;
                $lead->meta = $meta;
            }
            $lead->save_status = Lead::SAVE_SAVED;
            $lead->save();

            return ['lead_id' => $lead->id, 'crm_lead_id' => $entry->lead_id, 'pipeline_id' => $entry->pipeline_id, 'save_status' => 'saved', 'synced' => true, 'already_synced' => (bool) $existing, 'crm_duplicate' => (bool) $duplicate, 'crm_duplicate_reason' => $duplicate ? 'Matching contact identity' : null];
        });
    }

    public function saveSignal(int $id, ?int $pipelineId, User $user): array
    {
        $pipeline = $this->resolvePipeline($pipelineId, $user);

        return DB::transaction(function () use ($id, $pipeline, $user) {
            Organization::query()->whereKey(OrgContext::require()->id)->lockForUpdate()->firstOrFail();
            $signal = SocialSignal::query()->where('organization_id', OrgContext::require()->id)->lockForUpdate()->findOrFail($id);
            $conversion = app(SignalToLeadService::class)->convert($signal, OrgContext::require(), false);
            $lead = $conversion['lead'];
            $meta = $lead->meta ?? [];
            foreach ($signal->enrichmentLogs()->get() as $log) {
                if (blank($meta['email'] ?? null) && filled($log->found_email)) {
                    $meta['email'] = $log->found_email;
                }
                if (blank($meta['phone'] ?? null) && filled($log->found_phone)) {
                    $meta['phone'] = $log->found_phone;
                }
            }
            $lead->update(['meta' => $meta]);
            $result = $this->saveDiscovery($lead->id, $pipeline->id, $user);
            $signal->update(['lead_id' => $result['crm_lead_id']]);

            return $result + ['signal_id' => $signal->id];
        });
    }

    public function filter(array $filters): Builder
    {
        $query = $this->entries();
        foreach (['pipeline_id', 'priority', 'assigned_to_user_id'] as $field) {
            if (filled($filters[$field] ?? null)) {
                $query->where($field, $filters[$field]);
            }
        }
        if (filled($filters['status'] ?? null)) {
            $query->whereHas('stage', fn (Builder $q) => $q->where('slug', $filters['status']));
        }
        if (! empty($filters['uncategorized'])) {
            $query->whereRaw('1 = 0');
        }
        if (filled($filters['source'] ?? null)) {
            $query->whereHas('lead', fn (Builder $q) => $filters['source'] === 'sales_engine' ? $q->where(fn (Builder $inner) => $inner->whereNotNull('icp_profile_id')->orWhereNotIn('source', ['manual', 'import', 'agent_upload'])) : $q->where('source', $filters['source']));
        }
        if (filled($filters['search'] ?? null)) {
            $term = '%'.$filters['search'].'%';
            $query->whereHas('lead', fn (Builder $q) => $q->where(fn (Builder $inner) => $inner->where('name', 'like', $term)->orWhere('summary', 'like', $term)->orWhere('meta->email', 'like', $term)->orWhere('meta->company', 'like', $term)));
        }
        if (! empty($filters['lead_ids'])) {
            $query->whereIn('lead_id', $filters['lead_ids']);
        }

        return $query;
    }

    public function serialize(CrmEntry $entry): array
    {
        $lead = $entry->lead;
        $meta = array_replace($lead->meta ?? [], $entry->details ?? []);
        $actor = fn (?User $user) => $user ? ['id' => $user->id, 'name' => $user->name, 'email' => $user->email] : null;

        return array_replace($meta, [
            'id' => $lead->id, 'organization_id' => $entry->organization_id, 'company_id' => $entry->organization_id,
            'pipeline_id' => $entry->pipeline_id, 'name' => $lead->name, 'source' => $lead->source, 'summary' => $lead->summary,
            'status' => $entry->stage->slug, 'priority' => $entry->priority, 'budget_amount' => $entry->budget_amount, 'budget_currency' => $entry->budget_currency,
            'email' => $meta['email'] ?? null, 'phone' => $meta['phone'] ?? null, 'location' => $meta['location'] ?? null,
            'contacts' => $meta['contacts'] ?? [], 'company_name' => $meta['company_name'] ?? $meta['company'] ?? $lead->company?->name,
            'position' => $meta['position'] ?? $meta['title'] ?? null, 'profile_urls' => $meta['profile_urls'] ?? [],
            'created_by_user_id' => $entry->created_by_user_id, 'assigned_to_user_id' => $entry->assigned_to_user_id,
            'creator' => $actor($entry->creator), 'assignee' => $actor($entry->assignee), 'pipeline' => $entry->pipeline,
            'meta' => $meta, 'created_at' => $entry->created_at->toIso8601String(), 'updated_at' => $entry->updated_at->toIso8601String(),
        ]);
    }
}
