<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\Integrations\Factory23\CrmSyncService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class LeadSyncController extends Controller
{
    public function __construct(private readonly CrmSyncService $crmSync) {}

    public function syncToCrm(int $id): JsonResponse
    {
        $org = OrgContext::require();
        $lead = Lead::query()
            ->where('organization_id', $org->id)
            ->where('id', $id)
            ->firstOrFail();

        try {
            $result = $this->crmSync->pushLead($org, $lead);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }

    public function syncBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_ids' => ['required', 'array', 'min:1', 'max:25'],
            'lead_ids.*' => ['integer'],
        ]);

        $org = OrgContext::require();
        $results = [];
        $errors = [];

        foreach ($data['lead_ids'] as $leadId) {
            $lead = Lead::query()
                ->where('organization_id', $org->id)
                ->where('id', $leadId)
                ->first();

            if (! $lead) {
                $errors[] = "Lead {$leadId} not found.";
                continue;
            }

            try {
                $results[] = array_merge(
                    ['lead_id' => $lead->id],
                    $this->crmSync->pushLead($org, $lead),
                );
            } catch (InvalidArgumentException $e) {
                $errors[] = "Lead {$leadId}: ".$e->getMessage();
            }
        }

        return response()->json([
            'data' => [
                'synced' => $results,
                'errors' => $errors,
            ],
        ]);
    }
}
