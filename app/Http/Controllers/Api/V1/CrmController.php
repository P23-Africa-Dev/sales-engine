<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LeadResource;
use App\Models\Lead;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CrmController extends Controller
{
    public function pipeline(): JsonResponse
    {
        $orgId = OrgContext::require()->id;
        $leads = Lead::query()
            ->where('organization_id', $orgId)
            ->orderByDesc('score')
            ->get()
            ->groupBy('stage');

        $pipeline = collect(Lead::STAGES)->mapWithKeys(function (string $stage) use ($leads) {
            return [
                $stage => LeadResource::collection($leads->get($stage, collect())),
            ];
        });

        return response()->json(['data' => $pipeline]);
    }

    public function updateLead(Request $request, int $id): JsonResponse
    {
        $lead = Lead::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('id', $id)
            ->firstOrFail();

        $data = $request->validate([
            'stage' => ['sometimes', 'string', Rule::in(Lead::STAGES)],
            'summary' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'score' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $lead->fill($data);
        $lead->save();

        return response()->json(['data' => new LeadResource($lead)]);
    }
}
