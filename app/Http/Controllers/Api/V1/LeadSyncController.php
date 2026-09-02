<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\Integrations\Factory23\CrmSyncException;
use App\Services\Integrations\Factory23\CrmSyncService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        } catch (CrmSyncException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => $e->reason,
            ], 422);
        }

        $lead->refresh();

        return response()->json([
            'data' => array_merge($result, [
                'lead_id' => $lead->id,
                'save_status' => $lead->save_status,
            ]),
        ]);
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
                    ['lead_id' => $lead->id, 'save_status' => Lead::SAVE_SAVED],
                    $this->crmSync->pushLead($org, $lead),
                );
                $lead->refresh();
                $results[count($results) - 1]['save_status'] = $lead->save_status;
            } catch (CrmSyncException $e) {
                $errors[] = "Lead {$leadId}: " . $e->getMessage();
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
