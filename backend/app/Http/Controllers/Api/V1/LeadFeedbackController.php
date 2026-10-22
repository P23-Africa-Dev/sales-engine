<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\Leads\LeadFeedbackService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadFeedbackController extends Controller
{
    public function __construct(private readonly LeadFeedbackService $feedback) {}

    public function store(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'verdict' => ['required', 'in:not_relevant'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $leads = $this->feedback->reject(OrgContext::require(), [$id], $data['reason'] ?? null);
        $lead = $leads->first();
        if (! $lead) {
            return response()->json(['message' => 'Lead not found.'], 404);
        }

        return response()->json([
            'data' => [
                'id' => $lead->id,
                'save_status' => Lead::SAVE_REJECTED,
            ],
        ]);
    }

    public function storeMany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_ids' => ['required', 'array', 'min:1', 'max:100'],
            'lead_ids.*' => ['integer'],
            'verdict' => ['required', 'in:not_relevant'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $leads = $this->feedback->reject(OrgContext::require(), $data['lead_ids'], $data['reason'] ?? null);

        return response()->json([
            'data' => $leads->map(fn (Lead $lead) => [
                'id' => $lead->id,
                'save_status' => $lead->save_status,
            ])->values(),
        ]);
    }
}
