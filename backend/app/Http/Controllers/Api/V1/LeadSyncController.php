<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\Integrations\Factory23\CrmSyncException;
use App\Services\Integrations\Factory23\CrmSyncService;
use App\Services\Integrations\Factory23\RetryableCrmSyncException;
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
        } catch (RetryableCrmSyncException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => $e->reason,
                'retryable' => true,
            ], 422);
        } catch (CrmSyncException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'reason' => $e->reason,
                'retryable' => false,
            ], 422);
        }

        $lead->refresh();

        return response()->json([
            'data' => array_merge($result, [
                'lead_id' => $lead->id,
                'save_status' => $lead->save_status,
                'crm_duplicate' => filled($lead->crm_duplicate_of),
                'crm_duplicate_reason' => $lead->crm_duplicate_reason,
                'crm_fields_updated' => $lead->crm_fields_updated ?? [],
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
                $push = $this->crmSync->pushLead($org, $lead);
                $lead->refresh();
                $results[] = array_merge(
                    [
                        'lead_id' => $lead->id,
                        'save_status' => $lead->save_status,
                        'crm_duplicate' => filled($lead->crm_duplicate_of),
                        'crm_duplicate_reason' => $lead->crm_duplicate_reason,
                        'crm_fields_updated' => $lead->crm_fields_updated ?? [],
                    ],
                    $push,
                );
            } catch (CrmSyncException $e) {
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
