<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CompanyResource;
use App\Http\Resources\LeadResource;
use App\Models\Company;
use App\Models\Lead;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companies = Company::query()
            ->where('organization_id', OrgContext::require()->id)
            ->orderByDesc('priority_score')
            ->orderByDesc('id')
            ->limit((int) $request->integer('limit', 50))
            ->get();

        return response()->json([
            'data' => CompanyResource::collection($companies),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $company = Company::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('id', $id)
            ->firstOrFail();

        return response()->json([
            'data' => new CompanyResource($company),
        ]);
    }

    public function leads(Request $request): JsonResponse
    {
        $leads = Lead::query()
            ->where('organization_id', OrgContext::require()->id)
            ->when($request->query('stage'), fn ($q) => $q->where('stage', $request->query('stage')))
            ->orderByDesc('score')
            ->orderByDesc('id')
            ->limit((int) $request->integer('limit', 50))
            ->get();

        return response()->json([
            'data' => LeadResource::collection($leads),
        ]);
    }
}
