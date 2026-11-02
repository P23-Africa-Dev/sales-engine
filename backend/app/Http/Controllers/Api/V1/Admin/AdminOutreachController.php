<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminOrganizationNoteResource;
use App\Http\Resources\Admin\AdminOutreachActivityResource;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Services\Admin\AdminOutreachService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminOutreachController extends Controller
{
    public function __construct(
        private readonly AdminOutreachService $outreach,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
        ]);

        return response()->json([
            'data' => $this->outreach->dashboard($data['organization_id'] ?? null),
        ]);
    }

    public function organizations(Request $request): JsonResponse
    {
        $data = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
        ]);

        return response()->json([
            'data' => $this->outreach->organizationRollups($data['organization_id'] ?? null),
        ]);
    }

    public function activities(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'organization_id' => ['sometimes', 'nullable', 'integer', 'exists:organizations,id'],
            'channel' => ['sometimes', 'nullable', 'string', 'max:64'],
            'status' => ['sometimes', 'nullable', 'string', 'max:64'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $page = $this->outreach->paginateActivities($filters);

        return response()->json([
            'data' => AdminOutreachActivityResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function timeline(Organization $organization): JsonResponse
    {
        return response()->json([
            'data' => $this->outreach->timeline($organization),
        ]);
    }

    public function storeNote(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'note' => ['required', 'string', 'max:5000'],
        ]);

        $note = $this->outreach->addAdminNote($admin, $organization, $data['note']);

        return response()->json([
            'data' => new AdminOrganizationNoteResource($note),
        ], 201);
    }
}
