<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Lead;
use App\Models\OutreachActivity;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;

class MetricsController extends Controller
{
    public function index(): JsonResponse
    {
        $orgId = OrgContext::require()->id;

        return response()->json([
            'data' => [
                'leads_discovered' => Lead::query()
                    ->where('organization_id', $orgId)
                    ->where('save_status', Lead::SAVE_SAVED)
                    ->count(),
                'leads_pending_review' => Lead::query()
                    ->where('organization_id', $orgId)
                    ->where('save_status', Lead::SAVE_DRAFT)
                    ->count(),
                'leads_in_crm' => Lead::query()
                    ->where('organization_id', $orgId)
                    ->whereNotNull('synced_to_f23_at')
                    ->count(),
                'companies_cached' => Company::query()->where('organization_id', $orgId)->count(),
                'qualified_leads' => Lead::query()->where('organization_id', $orgId)->where('stage', 'qualified')->count(),
                'outreach_drafts' => OutreachActivity::query()->where('organization_id', $orgId)->count(),
                'pipeline' => collect(Lead::STAGES)->mapWithKeys(
                    fn (string $stage) => [
                        $stage => Lead::query()->where('organization_id', $orgId)->where('stage', $stage)->count(),
                    ]
                ),
            ],
        ]);
    }
}
