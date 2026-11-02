<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminSocialListeningRunResource;
use App\Http\Resources\Admin\AdminSocialSignalResource;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Services\Admin\AdminSocialListeningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminSocialListeningController extends Controller
{
    public function __construct(
        private readonly AdminSocialListeningService $social,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
        ]);

        return response()->json([
            'data' => $this->social->overview($data['organization_id'] ?? null),
        ]);
    }

    public function signals(Request $request): JsonResponse|StreamedResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'source' => ['sometimes', 'nullable', 'string', 'max:64'],
            'status' => ['sometimes', 'nullable', 'string', 'max:64'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        if ($request->wantsJson() === false && str_contains((string) $request->header('Accept'), 'text/csv')) {
            return $this->social->exportSignals($filters);
        }

        $page = $this->social->paginateSignals($filters);

        return response()->json([
            'data' => AdminSocialSignalResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'source' => ['sometimes', 'nullable', 'string', 'max:64'],
            'status' => ['sometimes', 'nullable', 'string', 'max:64'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        return $this->social->exportSignals($filters);
    }

    public function review(Request $request): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer', 'exists:social_signals,id'],
            'status' => ['required', 'string', Rule::in(['reviewed', 'dismissed', 'new'])],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->social->reviewSignals($admin, $data['ids'], $data['status'], $data['reason']),
        ]);
    }

    public function showSettings(Organization $organization): JsonResponse
    {
        $setting = $this->social->settingsForOrganization($organization);

        return response()->json([
            'data' => $this->formatSettings($setting),
        ]);
    }

    public function updateSettings(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'enabled_sources' => ['sometimes', 'nullable', 'array'],
            'meta_page_ids' => ['sometimes', 'nullable', 'array'],
            'cadence_days' => ['sometimes', 'nullable', 'integer', 'in:14,30'],
            'min_score' => ['sometimes', 'nullable', 'integer', 'min:40', 'max:90'],
            'freshness_window_days' => ['sometimes', 'nullable', 'integer', 'in:7,14,30,90,180'],
            'intent_filters' => ['sometimes', 'nullable', 'array'],
            'crm_destination' => ['sometimes', 'nullable', 'string', 'in:qualified_pipeline,human_review'],
            'outreach_channel_default' => ['sometimes', 'nullable', 'string', 'in:email,human_follow_up'],
            'sender_mode' => ['sometimes', 'nullable', 'string', 'in:platform,organization'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $setting = $this->social->updateSettings($admin, $organization, $data);

        return response()->json([
            'data' => $this->formatSettings($setting),
        ]);
    }

    public function pause(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $setting = $this->social->pause($admin, $organization, $data['reason'] ?? null);

        return response()->json([
            'data' => $this->formatSettings($setting),
        ]);
    }

    public function resume(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $setting = $this->social->resume($admin, $organization, $data['reason'] ?? null);

        return response()->json([
            'data' => $this->formatSettings($setting),
        ]);
    }

    public function runs(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'status' => ['sometimes', 'nullable', 'string', 'max:64'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $page = $this->social->paginateRuns($filters);

        return response()->json([
            'data' => AdminSocialListeningRunResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function queueRun(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'icp_profile_id' => ['sometimes', 'nullable', 'integer', 'exists:icp_profiles,id'],
            'force' => ['sometimes', 'boolean'],
        ]);

        $result = $this->social->queueRun(
            $admin,
            $organization,
            $data['icp_profile_id'] ?? null,
            (bool) ($data['force'] ?? false),
        );

        return response()->json(['data' => $result], 201);
    }

    public function retryRun(Request $request, SocialListeningRun $run): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        return response()->json([
            'data' => $this->social->retryRun($admin, $run),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatSettings(SocialListeningSetting $setting): array
    {
        return [
            'id' => $setting->id,
            'organization_id' => $setting->organization_id,
            'icp_profile_id' => $setting->icp_profile_id,
            'enabled_sources' => $setting->enabled_sources,
            'meta_page_ids' => $setting->meta_page_ids,
            'cadence_days' => $setting->cadence_days,
            'min_score' => $setting->min_score,
            'freshness_window_days' => $setting->freshness_window_days,
            'intent_filters' => $setting->intent_filters,
            'crm_destination' => $setting->crm_destination,
            'outreach_channel_default' => $setting->outreach_channel_default,
            'sender_mode' => $setting->sender_mode,
            'admin_paused_at' => $setting->admin_paused_at?->toIso8601String(),
            'last_run_at' => $setting->last_run_at?->toIso8601String(),
        ];
    }
}
