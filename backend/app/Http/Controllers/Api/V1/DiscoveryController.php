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

    public function cancel(int $id): JsonResponse
    {
        $run = DiscoveryRun::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('id', $id)
            ->firstOrFail();

        if (in_array($run->status, ['completed', 'cancelled'], true)) {
            return response()->json([
                'data' => [
                    'id' => $run->id,
                    'status' => $run->status,
                    'cancelled' => false,
                ],
            ]);
        }

        // Soft-failed runs stay pending with awaiting_user_choice — allow stop.
        if ($run->status === 'failed') {
            $placeholder = $this->pendingAssistantForRun($run);
            $awaitingChoice = $placeholder
                && (bool) ($placeholder->meta['pending'] ?? false)
                && (bool) ($placeholder->meta['awaiting_user_choice'] ?? false);

            if (! $awaitingChoice) {
                return response()->json([
                    'data' => [
                        'id' => $run->id,
                        'status' => $run->status,
                        'cancelled' => false,
                    ],
                ]);
            }
        }

        $run->update([
            'status' => 'cancelled',
            'error' => 'Cancelled by user.',
            'finished_at' => now(),
            'result_summary' => array_merge(
                is_array($run->result_summary) ? $run->result_summary : [],
                ['cancelled_by_user' => true],
            ),
        ]);

        $placeholder = $this->pendingAssistantForRun($run);

        if ($placeholder) {
            $placeholder->update([
                'body' => 'Lead search stopped. You can refine your query and try again.',
                'meta' => array_merge(is_array($placeholder->meta) ? $placeholder->meta : [], [
                    'pending' => false,
                    'awaiting_user_choice' => false,
                    'discovery_run_id' => $run->id,
                    'cancelled' => true,
                ]),
            ]);
        }

        return response()->json([
            'data' => [
                'id' => $run->id,
                'status' => 'cancelled',
                'cancelled' => true,
            ],
        ]);
    }

    private function pendingAssistantForRun(\App\Models\DiscoveryRun $run): ?\App\Models\ChatMessage
    {
        return \App\Models\ChatMessage::query()
            ->where('role', 'assistant')
            ->where('chat_session_id', $run->chat_session_id)
            ->orderByDesc('id')
            ->get()
            ->first(function (\App\Models\ChatMessage $message) use ($run): bool {
                return (int) ($message->meta['discovery_run_id'] ?? 0) === $run->id
                    && (
                        (bool) ($message->meta['pending'] ?? false)
                        || (bool) ($message->meta['awaiting_user_choice'] ?? false)
                    );
            });
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
