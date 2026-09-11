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
            'limit' => ['nullable', 'integer', 'min:1', 'max:150'],
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
            $data['limit'] ?? \App\Services\Discovery\QueryIntentService::DEFAULT_LEAD_LIMIT,
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
                'progress' => $this->resolveProgress($run),
                'error' => $run->error,
                'started_at' => $run->started_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * @return array{step: int, total_steps: int, sources_checked: int, candidates_found: int}
     */
    private function resolveProgress(DiscoveryRun $run): array
    {
        $summary = is_array($run->result_summary) ? $run->result_summary : [];
        if (isset($summary['progress']) && is_array($summary['progress'])) {
            return [
                'step' => (int) ($summary['progress']['step'] ?? 1),
                'total_steps' => (int) ($summary['progress']['total_steps'] ?? 4),
                'sources_checked' => (int) ($summary['progress']['sources_checked'] ?? 0),
                'candidates_found' => (int) ($summary['progress']['candidates_found'] ?? 0),
            ];
        }

        $stages = $run->stages ?? [];
        $last = count($stages) > 0 ? $stages[count($stages) - 1] : 'analyzing_brief';
        $stepMap = [
            'queued' => 1,
            'analyzing_brief' => 1,
            'searching_sources' => 2,
            'extracting' => 3,
            'synthesizing' => 3,
            'compiling_results' => 4,
            'completed' => 4,
        ];

        return [
            'step' => $stepMap[$last] ?? 1,
            'total_steps' => 4,
            'sources_checked' => 0,
            'candidates_found' => 0,
        ];
    }
}
