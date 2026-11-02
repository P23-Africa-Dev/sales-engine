<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminOrganizationResource;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Services\Admin\AdminOrganizationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminOrganizationController extends Controller
{
    public function __construct(
        private readonly AdminOrganizationService $organizations,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['all', 'active', 'pending', 'inactive'])],
            'pool' => ['sometimes', 'nullable', 'string', Rule::in(['lt_1000', '1000_2999', 'gte_3000'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $page = $this->organizations->paginate($filters);

        return response()->json([
            'data' => AdminOrganizationResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function show(Organization $organization): JsonResponse
    {
        $org = $this->organizations->find($organization->id);

        return response()->json([
            'data' => new AdminOrganizationResource($org),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'owner_email' => ['required', 'email', 'max:255'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:64'],
            'scope' => ['sometimes', 'nullable', 'string', 'max:255'],
            'purpose' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'string', Rule::in(['active', 'pending', 'inactive'])],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $result = $this->organizations->create($admin, $data);

        return response()->json([
            'data' => new AdminOrganizationResource($result['organization']),
            'invitation_email' => $result['invitation_email'],
        ], 201);
    }

    public function update(Request $request, Organization $organization): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:64'],
            'scope' => ['sometimes', 'nullable', 'string', 'max:255'],
            'purpose' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'string', Rule::in(['active', 'pending', 'inactive'])],
            'team_size' => ['sometimes', 'nullable', 'string', 'max:32'],
            'search_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'outreach_email_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'enrichment_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'crm_stale_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        if (isset($data['status']) && $data['status'] !== $organization->status) {
            $request->validate(['reason' => ['required', 'string', 'max:2000']]);
            $data['reason'] = $request->input('reason');
        }

        $org = $this->organizations->update($admin, $organization, $data);

        return response()->json([
            'data' => new AdminOrganizationResource($org),
        ]);
    }
}
