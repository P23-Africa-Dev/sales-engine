<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Usage\UsageService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;

class UsageController extends Controller
{
    public function __construct(private readonly UsageService $usage) {}

    public function show(): JsonResponse
    {
        return response()->json([
            'data' => $this->usage->snapshot(OrgContext::require()),
        ]);
    }
}
