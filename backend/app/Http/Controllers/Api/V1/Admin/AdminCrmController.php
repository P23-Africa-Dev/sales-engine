<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminCrmEntryResource;
use App\Models\CrmEntry;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Services\Admin\AdminCrmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminCrmController extends Controller
{
    public function __construct(
        private readonly AdminCrmService $crm,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
        ]);

        return response()->json([
            'data' => $this->crm->overview($data['organization_id'] ?? null),
        ]);
    }

    public function entries(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'stage_id' => ['sometimes', 'nullable', 'integer'],
            'stage_slug' => ['sometimes', 'nullable', 'string', 'max:64'],
            'assignee_id' => ['sometimes', 'nullable', 'integer'],
            'archived' => ['sometimes', 'nullable', 'string', Rule::in(['exclude', 'include', 'only'])],
            'sort' => ['sometimes', 'nullable', 'string', Rule::in(['newest', 'oldest', 'value_desc', 'value_asc'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $page = $this->crm->paginateEntries($filters);

        return response()->json([
            'data' => AdminCrmEntryResource::collection($page->items()),
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
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'stage_id' => ['sometimes', 'nullable', 'integer'],
            'stage_slug' => ['sometimes', 'nullable', 'string', 'max:64'],
            'archived' => ['sometimes', 'nullable', 'string', Rule::in(['exclude', 'include', 'only'])],
        ]);

        return $this->crm->exportEntries($filters);
    }

    public function show(CrmEntry $entry): JsonResponse
    {
        return response()->json([
            'data' => new AdminCrmEntryResource($this->crm->findEntry($entry->id)),
        ]);
    }

    public function update(Request $request, CrmEntry $entry): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
            'assigned_to_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'stage_id' => ['sometimes', 'nullable', 'integer', 'exists:crm_stages,id'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:64'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'budget_amount' => ['sometimes', 'nullable', 'numeric'],
            'priority' => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        $updated = $this->crm->updateEntry($admin, $entry, $data);

        return response()->json([
            'data' => new AdminCrmEntryResource($updated),
        ]);
    }

    public function archive(Request $request): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer', 'exists:crm_entries,id'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->crm->archive($admin, $data['ids'], $data['reason']),
        ]);
    }

    public function restore(Request $request): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer', 'exists:crm_entries,id'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->crm->restore($admin, $data['ids'], $data['reason']),
        ]);
    }

    public function storeNote(Request $request, CrmEntry $entry): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'note' => ['required', 'string', 'max:5000'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $note = $this->crm->addNote($admin, $entry, $data['note'], $data['reason'] ?? null);

        return response()->json([
            'data' => [
                'id' => $note->id,
                'note' => $note->note,
                'created_at' => $note->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function dismissDuplicate(Request $request, CrmEntry $entry): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => new AdminCrmEntryResource($this->crm->dismissDuplicate($admin, $entry, $data['reason'])),
        ]);
    }

    public function completeFollowUp(Request $request, CrmEntry $entry): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $activity = $this->crm->completeFollowUp($admin, $entry, $data['reason']);

        return response()->json([
            'data' => [
                'id' => $activity->id,
                'type' => $activity->type,
                'title' => $activity->title,
                'happened_at' => $activity->happened_at?->toIso8601String(),
            ],
        ]);
    }

    public function showReviewPolicy(Organization $organization): JsonResponse
    {
        return response()->json([
            'data' => $this->crm->reviewPolicy($organization),
        ]);
    }

    public function updateReviewPolicy(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'crm_stale_days' => ['required', 'integer', 'min:1', 'max:365'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->crm->updateReviewPolicy(
                $admin,
                $organization,
                (int) $data['crm_stale_days'],
                $data['reason'] ?? null,
            ),
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        return response()->json([
            'data' => $this->crm->activity($filters),
        ]);
    }
}
