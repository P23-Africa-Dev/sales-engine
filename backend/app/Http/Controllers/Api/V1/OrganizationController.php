<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrganizationResource;
use App\Services\Auth\AuthService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class OrganizationController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    public function index(Request $request): JsonResponse
    {
        $orgs = $request->user()->organizations()->get();

        return response()->json([
            'data' => OrganizationResource::collection($orgs),
        ]);
    }

    public function current(): JsonResponse
    {
        return response()->json([
            'data' => new OrganizationResource(OrgContext::require()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $org = $this->auth->createOrganization($data['name']);
        $this->auth->attachOwner($org, $request->user());

        return response()->json([
            'data' => new OrganizationResource($org),
        ], 201);
    }

    public function update(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'team_size' => ['sometimes', 'nullable', 'in:solo,2-10,11-50,51-200,201-500,500+'],
            'purpose' => ['sometimes', 'nullable', 'string', 'max:64'],
            'user_type' => ['sometimes', 'nullable', 'string', 'max:32'],
            'search_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'outreach_email_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'enrichment_limit_monthly' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        if (isset($data['country'])) {
            $data['country'] = strtoupper($data['country']);
        }

        $org->fill($data);
        if ($org->onboarding_completed_at === null && $request->hasAny(['country', 'team_size', 'purpose', 'user_type', 'name'])) {
            $org->onboarding_completed_at = now();
        }
        $org->save();

        return response()->json([
            'data' => new OrganizationResource($org->fresh()),
        ]);
    }
}
