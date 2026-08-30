<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrganizationResource;
use App\Services\Auth\AuthService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
