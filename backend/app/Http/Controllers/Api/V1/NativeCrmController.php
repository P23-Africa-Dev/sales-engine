<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\NativeCrmLeadRequest;
use App\Http\Resources\LeadResource;
use App\Models\CrmActivity;
use App\Models\CrmEntry;
use App\Models\CrmNote;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\User;
use App\Services\Crm\NativeCrmService;
use App\Support\OrgContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class NativeCrmController extends Controller
{
    public function __construct(private readonly NativeCrmService $crm) {}

    private function response(array $data, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $data], $status);
    }

    private function manage(Request $request): void
    {
        $role = $request->user()->organizations()->where('organizations.id', OrgContext::require()->id)->firstOrFail()->pivot->role;
        abort_unless(in_array($role, ['owner', 'admin'], true), 403, 'Only organization owners and admins can manage CRM settings.');
    }

    public function pending(Request $request): JsonResponse
    {
        $request->validate(['per_page' => ['sometimes', 'integer', 'min:1', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'], 'icp_profile_id' => ['sometimes', 'integer']]);
        $query = Lead::query()->where('organization_id', OrgContext::require()->id)->whereDoesntHave('crmEntry')->whereNull('meta->native_crm_lead_id')->with('crmEntry');
        if ($request->filled('icp_profile_id')) {
            $query->where('icp_profile_id', $request->integer('icp_profile_id'));
        }
        $page = $query->orderByDesc('id')->paginate($request->integer('per_page', 100));

        return $this->response(['items' => LeadResource::collection($page->getCollection()), 'last_page' => $page->lastPage(), 'total' => $page->total()]);
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate(['per_page' => ['sometimes', 'integer', 'min:1', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $page = $this->crm->filter($request->query())->orderByDesc('updated_at')->orderByDesc('id')->paginate($request->integer('per_page', 20));

        return $this->response(['items' => $page->getCollection()->map(fn (CrmEntry $entry) => $this->crm->serialize($entry)), 'pagination' => ['current_page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total(), 'last_page' => $page->lastPage(), 'next_page_url' => $page->nextPageUrl(), 'prev_page_url' => $page->previousPageUrl()]]);
    }

    public function show(int $id): JsonResponse
    {
        $entry = $this->crm->entry($id);
        $lead = $this->crm->serialize($entry);
        $lead['notes'] = CrmNote::query()->where('organization_id', $entry->organization_id)->where('lead_id', $id)->with('creator')->latest()->get();
        $lead['activities'] = CrmActivity::query()->where('organization_id', $entry->organization_id)->where('lead_id', $id)->with('creator')->latest()->get();

        return $this->response(['lead' => $lead]);
    }

    public function store(NativeCrmLeadRequest $request): JsonResponse
    {
        return DB::transaction(function () use ($request) {
            $pipeline = $this->crm->resolvePipeline($request->integer('pipeline_id') ?: null, $request->user());
            $lead = Lead::query()->create(['organization_id' => OrgContext::require()->id, 'name' => $request->validated('name'), 'source' => $request->validated('source') ?? 'manual', 'stage' => 'new', 'save_status' => 'draft']);
            $result = $this->crm->saveDiscovery($lead->id, $pipeline->id, $request->user());
            $entry = $this->crm->entry($result['crm_lead_id']);
            $this->apply($entry, $request->validated());

            return $this->response(['lead' => $this->crm->serialize($entry->fresh(['lead.company', 'pipeline', 'stage', 'creator', 'assignee']))], 201);
        });
    }

    public function update(NativeCrmLeadRequest $request, int $id): JsonResponse
    {
        $entry = $this->crm->entry($id);
        DB::transaction(fn () => $this->apply($entry, $request->validated()));

        return $this->show($id);
    }

    private function apply(CrmEntry $entry, array $data): void
    {
        $leadFields = array_intersect_key($data, array_flip(['name', 'source', 'summary']));
        $details = array_diff_key($data, array_flip(['name', 'source', 'summary', 'pipeline_id', 'status', 'priority', 'budget_amount', 'budget_currency', 'assigned_to_user_id']));
        $entry->lead->fill($leadFields);
        $entry->lead->meta = array_replace($entry->lead->meta ?? [], $details);
        $fields = array_intersect_key($data, array_flip(['pipeline_id', 'priority', 'budget_amount', 'budget_currency', 'assigned_to_user_id']));
        if (isset($data['status'])) {
            $stage = $this->crm->stages()->where('slug', $data['status'])->firstOrFail();
            $fields['stage_id'] = $stage->id;
            if (in_array($data['status'], Lead::STAGES, true)) {
                $entry->lead->stage = $data['status'];
            }
        }
        $entry->lead->save();
        $fields['identity_key'] = $this->crm->identity($entry->lead);
        $entry->fill($fields);
        $entry->save();
        $entry->touch();
    }

    public function destroy(int $id): JsonResponse
    {
        $entry = $this->crm->entry($id);
        DB::transaction(function () use ($entry) {
            $entry->delete();
            CrmNote::query()->where('lead_id', $entry->lead_id)->delete();
            CrmActivity::query()->where('lead_id', $entry->lead_id)->delete();
            $entry->lead->update(['save_status' => Lead::SAVE_DRAFT]);
            Lead::query()->where('organization_id', $entry->organization_id)->where('meta->native_crm_lead_id', $entry->lead_id)->each(function (Lead $lead) {
                $meta = $lead->meta ?? [];
                unset($meta['native_crm_lead_id']);
                $lead->update(['meta' => $meta, 'save_status' => Lead::SAVE_DRAFT]);
            });
        });

        return $this->response(['deleted_lead_id' => $id]);
    }

    public function saveDiscovery(Request $request): JsonResponse
    {
        return $this->saveSources($request, false);
    }

    public function saveSignals(Request $request): JsonResponse
    {
        return $this->saveSources($request, true);
    }

    private function saveSources(Request $request, bool $signals): JsonResponse
    {
        $key = $signals ? 'signal_ids' : 'lead_ids';
        $data = $request->validate([$key => ['required', 'array', 'min:1', 'max:25'], $key.'.*' => ['integer', 'distinct'], 'pipeline_id' => ['nullable', 'integer']]);
        $pipeline = $this->crm->resolvePipeline($data['pipeline_id'] ?? null, $request->user());
        $synced = [];
        $errors = [];
        $failed = [];
        foreach ($data[$key] as $id) {
            try {
                $synced[] = $signals ? $this->crm->saveSignal($id, $pipeline->id, $request->user()) : $this->crm->saveDiscovery($id, $pipeline->id, $request->user());
            } catch (ModelNotFoundException $error) {
                $errors[] = "Record {$id} was not found in your organization.";
                $failed[] = ['id' => $id, 'message' => end($errors)];
            }
        }

        return $this->response(['synced' => $synced, 'errors' => $errors, 'failed' => $failed]);
    }

    public function pipelines(): JsonResponse
    {
        $this->crm->initialize();

        return $this->response(['items' => $this->crm->pipelines()->orderBy('sort_order')->orderBy('id')->get()]);
    }

    public function storePipeline(Request $request): JsonResponse
    {
        $this->manage($request);
        $this->crm->initialize();
        $data = $request->validate(['name' => ['required', 'string', 'max:255', Rule::unique('crm_pipelines')->where('organization_id', OrgContext::require()->id)], 'currency_code' => ['sometimes', 'string', 'size:3']]);

        return $this->response(['pipeline' => CrmPipeline::query()->create($data + ['organization_id' => OrgContext::require()->id, 'sort_order' => $this->crm->pipelines()->count()])], 201);
    }

    public function updatePipeline(Request $request, int $id): JsonResponse
    {
        $this->manage($request);
        $pipeline = $this->crm->pipelines()->findOrFail($id);
        $pipeline->update($request->validate(['name' => ['sometimes', 'string', 'max:255', Rule::unique('crm_pipelines')->where('organization_id', OrgContext::require()->id)->ignore($id)], 'sort_order' => ['sometimes', 'integer', 'min:0']]));

        return $this->response(['pipeline' => $pipeline]);
    }

    public function deletePipeline(Request $request, int $id): JsonResponse
    {
        $this->manage($request);
        $request->validate(['force' => ['sometimes', 'boolean']]);

        return DB::transaction(function () use ($request, $id) {
            Organization::query()->whereKey(OrgContext::require()->id)->lockForUpdate()->firstOrFail();
            $pipeline = $this->crm->pipelines()->findOrFail($id);
            if ($pipeline->is_default) {
                throw ValidationException::withMessages(['pipeline' => 'Choose another default before deleting this pipeline.']);
            }
            $count = $this->crm->entries()->where('pipeline_id', $id)->count();
            if ($count > 0 && ! $request->boolean('force')) {
                throw ValidationException::withMessages(['label_usage_count' => (string) $count, 'pipeline_usage_count' => (string) $count, 'message' => 'Confirm reassignment before deleting.']);
            }
            $fallback = $this->crm->pipelines()->where('is_default', true)->firstOrFail();
            $this->crm->entries()->where('pipeline_id', $id)->update(['pipeline_id' => $fallback->id]);
            $pipeline->delete();

            return $this->response(['deleted_pipeline_id' => $id, 'reassigned_leads_count' => $count, 'reassigned_to_pipeline_id' => $fallback->id, 'reassigned_to_pipeline_name' => $fallback->name]);
        });
    }

    public function setDefault(Request $request, int $id): JsonResponse
    {
        $this->manage($request);

        return DB::transaction(function () use ($id) {
            Organization::query()->whereKey(OrgContext::require()->id)->lockForUpdate()->firstOrFail();
            $pipeline = $this->crm->pipelines()->findOrFail($id);
            $this->crm->pipelines()->update(['is_default' => false]);
            $pipeline->update(['is_default' => true]);

            return $this->response(['pipeline' => $pipeline]);
        });
    }

    public function preferences(Request $request): JsonResponse
    {
        $this->crm->initialize();

        return $this->response(['preferred_pipeline_id' => DB::table('crm_preferences')->where('organization_id', OrgContext::require()->id)->where('user_id', $request->user()->id)->value('pipeline_id'), 'company_default_pipeline_id' => $this->crm->pipelines()->where('is_default', true)->value('id')]);
    }

    public function setPreference(Request $request): JsonResponse
    {
        $data = $request->validate(['pipeline_id' => ['required', 'integer']]);
        $pipeline = $this->crm->resolvePipeline($data['pipeline_id'], $request->user());
        DB::table('crm_preferences')->updateOrInsert(['organization_id' => OrgContext::require()->id, 'user_id' => $request->user()->id], ['pipeline_id' => $pipeline->id]);

        return $this->preferences($request);
    }

    public function labels(): JsonResponse
    {
        $this->crm->initialize();

        return $this->response(['items' => $this->crm->stages()->orderBy('sort_order')->get()]);
    }

    public function storeLabel(Request $request): JsonResponse
    {
        $this->manage($request);
        $this->crm->initialize();
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/']]);

        return $this->response(['label' => CrmStage::query()->create($data + ['organization_id' => OrgContext::require()->id, 'slug' => Str::slug($data['name']).'-'.Str::lower(Str::random(6)), 'sort_order' => $this->crm->stages()->count()])], 201);
    }

    public function updateLabel(Request $request, int $id): JsonResponse
    {
        $this->manage($request);
        $stage = $this->crm->stages()->findOrFail($id);
        $stage->update($request->validate(['name' => ['sometimes', 'string', 'max:255'], 'color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/']]));

        return $this->response(['label' => $stage]);
    }

    public function reorderLabels(Request $request): JsonResponse
    {
        $this->manage($request);
        $ids = $request->validate(['ordered_label_ids' => ['required', 'array'], 'ordered_label_ids.*' => ['integer', 'distinct', Rule::exists('crm_stages', 'id')->where('organization_id', OrgContext::require()->id)]])['ordered_label_ids'];
        if (count($ids) !== $this->crm->stages()->count()) {
            throw ValidationException::withMessages(['ordered_label_ids' => 'Include every stage exactly once.']);
        }
        DB::transaction(function () use ($ids) {
            foreach ($ids as $order => $id) {
                $this->crm->stages()->whereKey($id)->update(['sort_order' => $order]);
            }
        });

        return $this->labels();
    }

    public function deleteLabel(Request $request, int $id): JsonResponse
    {
        $this->manage($request);
        $request->validate(['force' => ['sometimes', 'boolean']]);

        return DB::transaction(function () use ($request, $id) {
            Organization::query()->whereKey(OrgContext::require()->id)->lockForUpdate()->firstOrFail();
            $stage = $this->crm->stages()->findOrFail($id);
            if ($stage->is_default) {
                throw ValidationException::withMessages(['label' => 'The initial stage cannot be deleted.']);
            }
            $count = $this->crm->entries()->where('stage_id', $id)->count();
            if ($count && ! $request->boolean('force')) {
                throw ValidationException::withMessages(['label_usage_count' => (string) $count, 'pipeline_usage_count' => (string) $count, 'message' => 'Confirm reassignment before deleting.']);
            }
            $fallback = $this->crm->stages()->where('is_default', true)->firstOrFail();
            $this->crm->entries()->where('stage_id', $id)->update(['stage_id' => $fallback->id]);
            $stage->delete();

            return $this->response(['deleted_label_id' => $id, 'deleted_leads_count' => $count, 'reassigned_to_label_name' => $fallback->name]);
        });
    }

    public function note(Request $request, int $id): JsonResponse
    {
        $this->crm->entry($id);
        $data = $request->validate(['note' => ['required', 'string', 'max:10000']]);
        $note = CrmNote::query()->create($data + ['organization_id' => OrgContext::require()->id, 'lead_id' => $id, 'created_by_user_id' => $request->user()->id]);

        return $this->response(['note' => $note->load('creator')], 201);
    }

    public function activity(Request $request, int $id): JsonResponse
    {
        $this->crm->entry($id);
        $data = $request->validate(['type' => ['required', 'string', 'max:64'], 'title' => ['nullable', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'], 'happened_at' => ['nullable', 'date'], 'meta' => ['nullable', 'array']]);
        $activity = CrmActivity::query()->create($data + ['organization_id' => OrgContext::require()->id, 'lead_id' => $id, 'created_by_user_id' => $request->user()->id]);

        return $this->response(['activity' => $activity->load('creator')], 201);
    }

    public function assignees(): JsonResponse
    {
        return $this->response(['items' => OrgContext::require()->users()->get()->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->pivot->role])]);
    }

    public function pipeline(Request $request): JsonResponse
    {
        $this->crm->initialize();

        return $this->response(['total' => $this->crm->filter($request->query())->count(), 'stages' => $this->crm->stages()->orderBy('sort_order')->get()->map(fn (CrmStage $stage) => ['status' => $stage->slug, 'name' => $stage->name, 'color' => $stage->color, 'count' => $this->crm->filter($request->query())->where('stage_id', $stage->id)->count()])]);
    }

    public function analytics(Request $request): JsonResponse
    {
        $query = $this->crm->filter($request->query());
        $thisWeek = (clone $query)->where('created_at', '>=', now()->startOfWeek())->count();
        $lastWeek = (clone $query)->whereBetween('created_at', [now()->subWeek()->startOfWeek(), now()->startOfWeek()])->count();
        $growth = $lastWeek ? round(($thisWeek - $lastWeek) / $lastWeek * 100, 1) : 0;
        $trend = collect(range(6, 0))->map(function (int $days) use ($query) {
            $date = now()->subDays($days);

            return ['day' => $date->format('D'), 'date' => $date->toDateString(), 'value' => (clone $query)->whereDate('created_at', $date)->count()];
        });

        return $this->response(['total_leads' => $query->count(), 'week_growth_percent' => abs($growth), 'week_growth_direction' => $growth > 0 ? 'up' : ($growth < 0 ? 'down' : 'flat'), 'daily_trend' => $trend, 'month_new_leads' => (clone $query)->where('created_at', '>=', now()->startOfMonth())->count(), 'month_label' => now()->format('F'), 'highlight_day' => null]);
    }

    public function uploads(): JsonResponse
    {
        $query = $this->crm->filter(['source' => 'agent_upload']);
        $top = (clone $query)->select('created_by_user_id')->selectRaw('count(*) as total_uploads')->groupBy('created_by_user_id')->orderByDesc('total_uploads')->first();
        $user = $top ? User::find($top->created_by_user_id) : null;

        return $this->response(['total_uploaded_leads' => $query->count(), 'top_agent' => $user ? ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'avatar_url' => null, 'total_uploads' => (int) $top->total_uploads] : null, 'recent_leads' => (clone $query)->latest()->limit(5)->get()->map(fn (CrmEntry $e) => $this->crm->serialize($e)), 'source_filter' => 'agent_upload']);
    }

    public function importPreview(Request $request): JsonResponse
    {
        return $this->importRows($request, true);
    }

    public function import(Request $request): JsonResponse
    {
        return $this->importRows($request, false);
    }

    private function importRows(Request $request, bool $preview): JsonResponse
    {
        $data = $request->validate(['pipeline_id' => ['required', 'integer'], 'rows' => ['required', 'array', 'min:1', 'max:1000'], 'rows.*' => ['array'], 'duplicate_policy' => ['sometimes', 'in:create,skip,update']]);
        $pipeline = $this->crm->resolvePipeline($data['pipeline_id'], $request->user());
        $failed = [];
        $duplicates = [];
        $skipped = [];
        $created = 0;
        $updated = 0;
        foreach ($data['rows'] as $index => $row) {
            if (isset($row['budget_amount']) && $row['budget_amount'] === '') {
                unset($row['budget_amount']);
            }
            if (isset($row['profile_urls']) && is_string($row['profile_urls'])) {
                $row['profile_urls'] = array_values(array_filter(preg_split('/[;,\\s]+/', $row['profile_urls'])));
            }
            $validator = Validator::make($row, ['name' => ['required', 'string', 'max:255'], 'email' => ['nullable', 'email'], 'phone' => ['nullable', 'string', 'max:64'], 'website' => ['nullable', 'url:http,https'], 'budget_amount' => ['nullable', 'numeric', 'min:0'], 'budget_currency' => ['nullable', 'string', 'size:3'], 'status' => ['sometimes', Rule::exists('crm_stages', 'slug')->where('organization_id', OrgContext::require()->id)], 'priority' => ['sometimes', 'in:low,medium,high,urgent'], 'profile_urls' => ['sometimes', 'array'], 'profile_urls.*' => ['url:http,https']]);
            if ($validator->fails()) {
                $failed[] = ['row_index' => $index + 1, 'data' => $row, 'errors' => $validator->errors()->toArray()];

                continue;
            }
            $probe = new Lead(['meta' => $row]);
            $key = $this->crm->identity($probe);
            $existing = $key ? $this->crm->entries()->where('identity_key', $key)->first() : null;
            if ($existing) {
                $duplicates[] = ['row_index' => $index + 1, 'data' => $row, 'existing_lead_id' => $existing->lead_id, 'existing_lead_name' => $existing->lead->name];
            }
            if ($preview) {
                continue;
            }
            if ($existing && ($data['duplicate_policy'] ?? 'skip') === 'skip') {
                $skipped[] = ['row_index' => $index + 1, 'data' => $row, 'reason' => 'Matching contact identity'];

                continue;
            }
            DB::transaction(function () use ($row, $pipeline, $request, $existing, $data, &$created, &$updated) {
                if ($existing && ($data['duplicate_policy'] ?? 'skip') === 'update') {
                    $entry = $existing;
                    $updated++;
                } else {
                    $lead = Lead::query()->create(['organization_id' => OrgContext::require()->id, 'name' => $row['name'], 'source' => $row['source'] ?? 'import', 'stage' => 'new', 'save_status' => 'saved']);
                    $stage = $this->crm->stages()->where('is_default', true)->firstOrFail();
                    $entry = CrmEntry::query()->create(['organization_id' => OrgContext::require()->id, 'lead_id' => $lead->id, 'pipeline_id' => $pipeline->id, 'stage_id' => $stage->id, 'created_by_user_id' => $request->user()->id]);
                    $created++;
                }
                $allowed = array_intersect_key($row, array_flip(['name', 'email', 'phone', 'location', 'company_name', 'website', 'position', 'profile_urls', 'source', 'status', 'priority', 'budget_amount', 'budget_currency']));
                $this->apply($entry, $allowed);
            });
        }

        return $this->response($preview ? ['total_rows' => count($data['rows']), 'valid_count' => count($data['rows']) - count($failed), 'duplicate_count' => count($duplicates), 'error_rows' => $failed, 'duplicate_rows' => $duplicates] : ['imported_count' => $created, 'updated_count' => $updated, 'skipped_count' => count($skipped), 'failed_rows' => $failed, 'skipped_rows' => $skipped]);
    }

    public function export(Request $request): StreamedResponse
    {
        $request->validate(['format' => ['sometimes', 'in:csv'], 'lead_ids' => ['sometimes', 'array'], 'lead_ids.*' => ['integer']]);
        $query = $this->crm->filter($request->query());

        return response()->streamDownload(function () use ($query) {
            $stream = fopen('php://output', 'w');
            $columns = ['name', 'email', 'phone', 'location', 'company_name', 'website', 'position', 'source', 'status', 'priority', 'budget_amount', 'budget_currency'];
            fputcsv($stream, $columns, ',', '"', '');
            foreach ($query->orderBy('id')->lazy(200) as $entry) {
                $record = $this->crm->serialize($entry);
                $row = array_map(function ($field) use ($record) {
                    $value = (string) ($record[$field] ?? '');

                    return preg_match('/^[=+@\\-\\t\\r]/', $value) ? "'".$value : $value;
                }, $columns);
                fputcsv($stream, $row, ',', '"', '');
            }
            fclose($stream);
        }, 'crm-leads.csv', ['Content-Type' => 'text/csv']);
    }
}
