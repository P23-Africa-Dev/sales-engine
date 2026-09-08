<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\SocialSignalResource;
use App\Jobs\ProcessSignalReminderJob;
use App\Jobs\RunSocialListeningJob;
use App\Models\OutreachIdentity;
use App\Models\SignalReminder;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Icp\IcpProfileService;
use App\Services\Intent\SignalToLeadService;
use App\Services\Intent\SocialListeningRunService;
use App\Services\Intent\SocialListeningSettingsService;
use App\Services\Outreach\OutreachDraftService;
use App\Services\Outreach\OutreachSendService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class SocialListeningController extends Controller
{
    public function __construct(
        private readonly IcpProfileService $icps,
        private readonly SocialListeningSettingsService $settings,
        private readonly SocialListeningRunService $runs,
        private readonly OutreachDraftService $outreachDraft,
        private readonly OutreachSendService $outreachSend,
        private readonly SignalToLeadService $signalToLead,
    ) {}

    public function indexSignals(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            'search' => ['nullable', 'string', 'max:200'],
            'source' => ['nullable', 'string', 'max:64'],
            'signal_type' => ['nullable', 'string', 'max:64'],
            'buying_stage' => ['nullable', 'string', 'max:64'],
            'max_age_days' => ['nullable', 'integer', 'min:1', 'max:90'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile before viewing social signals.'], 422);
        }

        $query = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('icp_profile_id', $icp->id)
            ->where('status', '!=', 'dismissed')
            ->orderByDesc('score')
            ->orderByRaw('posted_at IS NULL ASC')
            ->orderByDesc('posted_at')
            ->orderByDesc('id');

        if (array_key_exists('max_age_days', $data) && $data['max_age_days'] !== null) {
            $cutoff = now()->subDays((int) $data['max_age_days']);
            $query->where(function ($q) use ($cutoff) {
                $q->whereNull('posted_at')
                    ->orWhere('posted_at', '>=', $cutoff);
            });
        }

        if (! empty($data['search'])) {
            $term = '%' . $data['search'] . '%';
            $query->where(function ($q) use ($term) {
                $q->where('post_text', 'like', $term)
                    ->orWhere('company_name', 'like', $term)
                    ->orWhere('persona', 'like', $term)
                    ->orWhere('intent_label', 'like', $term);
            });
        }

        if (! empty($data['source']) && $data['source'] !== 'all') {
            $query->where('source_label', $data['source']);
        }

        if (! empty($data['signal_type']) && $data['signal_type'] !== 'all') {
            $query->where('signal_type', $data['signal_type']);
        }

        if (! empty($data['buying_stage']) && $data['buying_stage'] !== 'all') {
            $query->where('buying_stage', $data['buying_stage']);
        }

        $perPage = $data['per_page'] ?? 10;
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => SocialSignalResource::collection($paginator->items()),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function showSignal(int $id): JsonResponse
    {
        $org = OrgContext::require();
        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        return response()->json(['data' => new SocialSignalResource($signal)]);
    }

    public function metrics(): JsonResponse
    {
        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile first.'], 422);
        }

        $settings = $this->settings->forIcp($org, $icp);
        $minScore = $settings->min_score;

        $base = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('icp_profile_id', $icp->id)
            ->where('status', '!=', 'dismissed');

        $detected = (clone $base)->count();
        $high = (clone $base)->where('score', '>=', $minScore)->count();
        $synced = (clone $base)->where('status', 'synced')->count();

        $weekAgo = now()->subWeek();
        $detectedThisWeek = (clone $base)->where('created_at', '>=', $weekAgo)->count();
        $detectedPriorWeek = (clone $base)->whereBetween('created_at', [$weekAgo->copy()->subWeek(), $weekAgo])->count();
        $percent = $detectedPriorWeek > 0
            ? (int) round((($detectedThisWeek - $detectedPriorWeek) / $detectedPriorWeek) * 100)
            : ($detectedThisWeek > 0 ? 100 : 0);

        $latestRun = $this->runs->latestRun($org, $icp);

        return response()->json([
            'data' => [
                'signals_detected' => $detected,
                'high_opportunities' => $high,
                'added_to_crm' => $synced,
                'percent_change' => $percent,
                'last_run_at' => $settings->last_run_at?->toIso8601String(),
                'latest_run' => $this->runs->formatLatestRun($latestRun),
            ],
        ]);
    }

    public function showSettings(): JsonResponse
    {
        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile first.'], 422);
        }

        $setting = $this->settings->forIcp($org, $icp);

        return response()->json(['data' => $this->formatSettings($setting)]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile first.'], 422);
        }

        $data = $request->validate([
            'enabled_sources' => ['nullable', 'array'],
            'cadence_days' => ['nullable', 'integer', 'in:14,30'],
            'min_score' => ['nullable', 'integer', 'min:40', 'max:90'],
            'freshness_window_days' => ['nullable', 'integer', 'in:7,14,30'],
            'intent_filters' => ['nullable', 'array'],
            'crm_destination' => ['nullable', 'string', 'in:qualified_pipeline,human_review'],
            'outreach_channel_default' => ['nullable', 'string', 'in:email,human_follow_up'],
            'sender_mode' => ['nullable', 'string', 'in:platform,organization'],
            'org_verified_from_email' => ['nullable', 'email', 'max:255'],
            'org_verified_domain' => ['nullable', 'string', 'max:255'],
            'verification_status' => ['nullable', 'string', 'in:pending,verified,failed'],
        ]);

        $setting = $this->settings->update($org, $icp, $data);

        return response()->json(['data' => $this->formatSettings($setting)]);
    }

    public function storeRun(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile before running social listening.'], 422);
        }

        $recent = SocialListeningRun::query()
            ->where('organization_id', $org->id)
            ->where('icp_profile_id', $icp->id)
            ->where('created_at', '>=', now()->subHour())
            ->whereIn('status', ['queued', 'running', 'completed'])
            ->exists();

        if ($recent && ! $request->boolean('force')) {
            return response()->json(['message' => 'A social listening run was started recently. Try again later or pass force=true.'], 429);
        }

        $run = SocialListeningRun::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'user_id' => $request->user()?->id,
            'status' => 'queued',
            'stages' => ['queued'],
        ]);

        RunSocialListeningJob::dispatch($run->id);

        return response()->json(['data' => ['id' => $run->id, 'status' => $run->status]], 201);
    }

    public function bootstrapRun(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile before running social listening.'], 422);
        }

        $result = $this->runs->bootstrap(
            $org,
            $icp,
            $request->user(),
            $request->boolean('force'),
        );

        $latestRun = $this->runs->latestRun($org, $icp);

        return response()->json([
            'data' => array_merge($result, [
                'latest_run' => $this->runs->formatLatestRun($latestRun),
            ]),
        ], $result['bootstrapped'] ? 201 : 200);
    }

    public function showRun(int $id): JsonResponse
    {
        $run = SocialListeningRun::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('id', $id)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => $run->id,
                'status' => $run->status,
                'stages' => $run->stages,
                'signals_created' => $run->signals_created,
                'result_summary' => $run->result_summary,
                'error' => $run->error,
                'started_at' => $run->started_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
            ],
        ]);
    }

    public function createOutreach(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'send' => ['nullable', 'boolean'],
            'to_email' => ['nullable', 'email'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Active ICP required.'], 422);
        }

        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        $draft = $this->outreachDraft->draftFromSocialSignal($org, $icp, $signal);

        if (! empty($data['send']) && ! empty($data['to_email'])) {
            try {
                $user = $request->user();
                if (! $user) {
                    return response()->json(['message' => 'Authenticated user required to send email.'], 401);
                }

                $activity = \App\Models\OutreachActivity::query()->find($draft['activity_id'] ?? null);
                $this->outreachSend->sendEmail(
                    $org,
                    $user,
                    $data['to_email'],
                    (string) ($draft['subject'] ?? 'Outreach'),
                    $draft['body'],
                    $activity,
                );
                $draft['sent'] = true;
            } catch (\Throwable $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        return response()->json(['data' => $draft]);
    }

    public function setReminder(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'remind_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required.'], 401);
        }

        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        $remindAt = isset($data['remind_at']) ? \Carbon\Carbon::parse($data['remind_at']) : now()->addDay();

        $reminder = SignalReminder::query()->create([
            'organization_id' => $org->id,
            'social_signal_id' => $signal->id,
            'user_id' => $user->id,
            'remind_at' => $remindAt,
            'note' => $data['note'] ?? $signal->recommended_action,
        ]);

        ProcessSignalReminderJob::dispatch($reminder->id)->delay($remindAt);

        return response()->json([
            'data' => [
                'id' => $reminder->id,
                'remind_at' => $reminder->remind_at->toIso8601String(),
            ],
        ], 201);
    }

    public function syncToCrm(int $id): JsonResponse
    {
        $org = OrgContext::require();
        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        try {
            $result = $this->signalToLead->convert($signal, $org, true);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'lead_id' => $result['lead']->id,
                'f23_lead_id' => $result['lead']->f23_lead_id,
                'crm' => $result['crm'],
                'signal' => new SocialSignalResource($signal->fresh()),
            ],
        ]);
    }

    public function dismiss(int $id): JsonResponse
    {
        $org = OrgContext::require();
        $signal = SocialSignal::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        $signal->update(['status' => 'dismissed']);

        return response()->json(['data' => new SocialSignalResource($signal)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatSettings(SocialListeningSetting $setting): array
    {
        return [
            'enabled_sources' => $setting->enabled_sources ?? SocialListeningSetting::DEFAULT_SOURCES,
            'cadence_days' => $setting->cadence_days,
            'min_score' => $setting->min_score,
            'freshness_window_days' => (int) ($setting->freshness_window_days ?? 14),
            'intent_filters' => $setting->intent_filters ?? SocialListeningSetting::DEFAULT_INTENT_FILTERS,
            'crm_destination' => $setting->crm_destination,
            'outreach_channel_default' => $setting->outreach_channel_default,
            'sender_mode' => $setting->sender_mode,
            'org_verified_from_email' => $setting->org_verified_from_email,
            'org_verified_domain' => $setting->org_verified_domain,
            'verification_status' => $setting->verification_status,
            'last_run_at' => $setting->last_run_at?->toIso8601String(),
        ];
    }
}
