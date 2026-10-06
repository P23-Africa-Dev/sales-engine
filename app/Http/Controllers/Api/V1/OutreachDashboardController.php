<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CrmActivity;
use App\Models\CrmEntry;
use App\Models\OutreachActivity;
use App\Services\Crm\NativeCrmService;
use App\Support\OrgContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutreachDashboardController extends Controller
{
    public function __construct(private readonly NativeCrmService $crm) {}

    private function activities(Request $request): Builder
    {
        $query = OutreachActivity::query()->where('organization_id', OrgContext::require()->id);
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn (Builder $q) => $q->where('name', 'like', $term)->orWhere('preview', 'like', $term));
        }
        if ($request->filled('channel') && $request->input('channel') !== 'all') {
            $query->whereIn('channel', [$request->input('channel'), $request->input('channel').' draft']);
        }
        if ($request->filled('status') && $request->input('status') !== 'all') {
            if ($request->input('status') === 'draft') {
                $query->whereNull('delivery_status')->whereNull('sent_at');
            } else {
                $query->where('delivery_status', $request->input('status'));
            }
        }
        if ($request->filled('business_id')) {
            $query->where('company_id', $request->integer('business_id'));
        }

        return $query;
    }

    private function metrics(Builder $query): array
    {
        $count = fn (array $statuses) => (clone $query)->whereIn('delivery_status', $statuses)->count();

        return ['total' => (clone $query)->count(), 'deliveredCount' => $count(['delivered', 'opened', 'clicked']), 'openedCount' => $count(['opened', 'clicked']), 'clickedCount' => $count(['clicked']), 'failedCount' => $count(['failed', 'bounced', 'dropped', 'spam']), 'emailCount' => (clone $query)->whereIn('channel', ['email', 'email draft'])->count(), 'whatsappCount' => (clone $query)->whereIn('channel', ['whatsapp', 'whatsapp draft'])->count()];
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate(['per_page' => ['sometimes', 'integer', 'min:1', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'], 'sort' => ['sometimes', 'in:newest,oldest,name_asc,name_desc']]);
        $query = $this->activities($request);
        $metrics = $this->metrics($query);
        [$column, $direction] = match ($request->input('sort', 'newest')) {
            'oldest' => ['updated_at', 'asc'], 'name_asc' => ['name', 'asc'], 'name_desc' => ['name', 'desc'], default => ['updated_at', 'desc']
        };
        $page = $query->orderBy($column, $direction)->orderBy('id', $direction)->paginate($request->integer('per_page', 10));

        return response()->json(['data' => ['items' => $page->getCollection()->map(fn (OutreachActivity $a) => $this->activity($a)), 'total' => $page->total(), 'last_page' => $page->lastPage(), 'current_page' => $page->currentPage(), 'metrics' => $metrics]]);
    }

    private function activity(OutreachActivity $a): array
    {
        return ['id' => $a->id, 'name' => $a->name, 'channel' => str_replace(' draft', '', $a->channel), 'preview' => $a->preview ?? '', 'accentBg' => $a->accent_bg ?? '', 'accentIcon' => $a->accent_icon ?? '', 'occurred_at' => $a->occurred_at?->toIso8601String() ?? $a->created_at->toIso8601String(), 'updated_at' => $a->updated_at->toIso8601String(), 'delivery_status' => $a->delivery_status ?? ($a->sent_at ? 'sent' : null), 'last_event_at' => $a->last_event_at?->toIso8601String(), 'bounce_reason' => $a->bounce_reason, 'company_id' => $a->company_id, 'lead_id' => $a->lead_id];
    }

    public function dashboard(): JsonResponse
    {
        $org = OrgContext::require();
        $this->crm->initialize();
        $activities = OutreachActivity::query()->where('organization_id', $org->id);
        $sent = (clone $activities)->whereIn('channel', ['email', 'email draft'])->whereNotNull('sent_at')->count();
        $emailTotal = (clone $activities)->whereIn('channel', ['email', 'email draft'])->count();
        $businesses = Company::query()->where('organization_id', $org->id)->withCount(['leads as prospects_count' => fn (Builder $q) => $q->whereHas('crmEntry')])->orderBy('name')->get();
        $entries = $this->crm->entries()->get()->groupBy(fn (CrmEntry $e) => $e->lead->company_id);
        $counts = (clone $activities)->whereIn('channel', ['email', 'email draft'])->whereNotNull('sent_at')->select('company_id')->selectRaw('count(*) as total')->groupBy('company_id')->pluck('total', 'company_id');
        $companies = $businesses->map(function (Company $company) use ($entries, $counts) {
            $entry = $entries->get($company->id)?->first();
            $meta = $company->business_fields ?? [];

            return ['id' => (string) $company->id, 'name' => $company->name, 'company' => $company->name, 'industry' => $company->sector ?? '—', 'country' => $company->country_code ?? '—', 'website' => $company->website ?? '—', 'owner' => $entry?->assignee?->name ?? $entry?->creator?->name ?? '—', 'created' => $company->created_at->toDateString(), 'avatarColor' => '#42a8a1', 'emailsSent' => (int) ($counts[$company->id] ?? 0), 'prospects' => $company->prospects_count, 'followUpsCompleted' => CrmActivity::query()->where('organization_id', $company->organization_id)->where('type', 'follow_up_completed')->whereIn('lead_id', $entries->get($company->id, collect())->pluck('lead_id'))->count(), 'pipeline' => $entry?->pipeline?->name, 'pipelineIds' => $entries->get($company->id, collect())->pluck('pipeline_id')->unique()->map(fn ($id) => (string) $id)->values(), 'email' => $company->email ?? ($entry?->lead?->meta['email'] ?? null)];
        });
        $metric = fn (string $id, string $title, ?int $total, string $primary, string $secondary, ?int $percent) => ['id' => $id, 'title' => $title, 'total' => $total, 'primaryLabel' => $primary, 'secondaryLabel' => $secondary, 'primaryPercent' => $percent, 'secondaryPercent' => null, 'avatars' => 0];

        return response()->json(['data' => ['source' => 'live', 'counts' => ['outreach' => (clone $activities)->count(), 'businesses' => $companies->count()], 'defaultBusinessId' => $companies->first()['id'] ?? null, 'businesses' => $companies, 'pipelines' => $this->crm->pipelines()->orderBy('sort_order')->get(['id', 'name']), 'metrics' => [$metric('email', 'No of Emails', $emailTotal, 'Sent', 'Received unavailable', $emailTotal ? (int) round($sent / $emailTotal * 100) : 0), $metric('sms', 'No of SMS', null, 'Unavailable', 'Unavailable', null), $metric('in-person', 'No of In-persons Outreach', null, 'Unavailable', 'Unavailable', null)], 'outreach' => (clone $activities)->orderByDesc('updated_at')->get()->map(fn (OutreachActivity $a) => ['id' => (string) $a->id, 'businessId' => $a->company_id ? (string) $a->company_id : null, 'name' => $a->name, 'channel' => str_replace(' draft', '', $a->channel), 'status' => $a->delivery_status ?? ($a->sent_at ? 'sent' : 'Draft'), 'owner' => '—', 'created' => $a->created_at->toDateString(), 'avatarColor' => '#42a8a1']), 'supported_channels' => ['email', 'whatsapp']]]);
    }
}
