<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiscoveryRun;
use App\Services\Discovery\DiscoveryOrchestrator;
use App\Services\Icp\IcpProfileService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscoveryController extends Controller
{
    public function __construct(
        private readonly DiscoveryOrchestrator $discovery,
        private readonly IcpProfileService $icps,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => ['nullable', 'string', 'max:1000'],
            'intent' => ['nullable', 'string', 'in:quick_research,generate_leads'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:25'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Activate an ICP profile before running discovery.'], 422);
        }

        $result = $this->discovery->run(
            $org,
            $icp,
            $request->user(),
            $data['query'] ?? '',
            $data['intent'] ?? 'generate_leads',
            null,
            $data['limit'] ?? 8,
        );

        return response()->json([
            'data' => [
                'id' => $result['run']->id,
                'status' => $result['run']->status,
                'stages' => $result['run']->stages,
                'leads' => $result['leads'],
                'result_summary' => $result['run']->result_summary,
            ],
        ], 201);
    }

    public function show(int $id): JsonResponse
    {
        $run = DiscoveryRun::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('id', $id)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => $run->id,
                'status' => $run->status,
                'query' => $run->query,
                'intent' => $run->intent,
                'stages' => $run->stages,
                'result_summary' => $run->result_summary,
                'error' => $run->error,
                'started_at' => $run->started_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
            ],
        ]);
    }
}
