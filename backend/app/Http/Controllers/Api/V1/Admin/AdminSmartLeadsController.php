<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminLeadResource;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\PlatformAdmin;
use App\Services\Admin\AdminSmartLeadsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminSmartLeadsController extends Controller
{
    public function __construct(
        private readonly AdminSmartLeadsService $leads,
    ) {}

    public function index(Request $request, Organization $organization): JsonResponse
    {
        $filters = $request->validate([
            'tier' => ['sometimes', 'nullable', 'string', Rule::in(['all', 'high', 'middle', 'low'])],
            'min_score' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'max_score' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $page = $this->leads->paginateLeads($organization, $filters);

        return response()->json([
            'data' => AdminLeadResource::collection($page->items()),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function show(Lead $lead): JsonResponse
    {
        $detail = $this->leads->leadDetail($this->leads->findLead($lead->id));

        return response()->json([
            'data' => [
                'lead' => new AdminLeadResource($detail['lead']),
                'contacts' => $detail['contacts'],
                'signals' => $detail['signals'],
                'activities' => $detail['activities'],
                'tier' => $detail['tier'],
            ],
        ]);
    }

    public function storeNote(Request $request, Lead $lead): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'note' => ['required', 'string', 'max:5000'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $this->leads->addNote($admin, $lead, $data['note'], $data['reason'] ?? null);

        return response()->json([
            'data' => new AdminLeadResource($this->leads->findLead($lead->id)),
        ], 201);
    }

    public function prepareOutreach(Request $request): JsonResponse
    {
        /** @var PlatformAdmin $admin */
        $admin = $request->user();

        $data = $request->validate([
            'lead_ids' => ['required', 'array', 'min:1', 'max:200'],
            'lead_ids.*' => ['integer', 'exists:leads,id'],
            'sequence' => ['required', 'string', 'max:255'],
        ]);

        $ids = $this->leads->prepareOutreach($admin, $data['lead_ids'], $data['sequence']);

        return response()->json([
            'data' => [
                'prepared_lead_ids' => $ids,
                'updated' => count($ids),
                'lead_ids' => $ids,
            ],
        ]);
    }

    public function analytics(Organization $organization): JsonResponse
    {
        return response()->json([
            'data' => $this->leads->analytics($organization),
        ]);
    }
}
