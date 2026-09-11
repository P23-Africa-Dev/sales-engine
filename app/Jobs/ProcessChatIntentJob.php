<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\DiscoveryRun;
use App\Models\Lead;
use App\Services\Chat\ChatService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\TimeoutExceededException;
use Illuminate\Support\Facades\Log;

class ProcessChatIntentJob implements ShouldQueue
{
    use Queueable;

    /** Safety net; orchestrator soft-completes around HARD_DEADLINE_SECONDS (150). */
    public int $timeout = 300;

    public int $tries = 1;

    public function __construct(
        public int $runId,
        public int $userMessageId,
        public ?string $clientTimezone = null,
    ) {
        $this->onQueue('discovery');
    }

    public function handle(ChatService $chat): void
    {
        try {
            $chat->processQueuedIntent($this->runId, $this->userMessageId, $this->clientTimezone);
        } catch (\Throwable $e) {
            Log::error('Chat intent job failed', [
                'run_id' => $this->runId,
                'error' => $e->getMessage(),
            ]);
            $this->failRun($e->getMessage(), $e instanceof TimeoutExceededException);
            throw $e;
        }
    }

    public function failed(?\Throwable $e): void
    {
        $this->failRun(
            $e?->getMessage() ?? 'Job failed or timed out.',
            $e instanceof TimeoutExceededException,
        );
    }

    private function failRun(string $error, bool $wasTimeout = false): void
    {
        try {
            $run = DiscoveryRun::query()->find($this->runId);
            if (! $run) {
                return;
            }

            // Soft-complete already finished the run.
            if ($run->status === 'completed') {
                return;
            }

            $recoveredLeads = [];
            if ($wasTimeout && in_array($run->status, ['queued', 'running'], true)) {
                $recoveredLeads = $this->recoverLeadsCreatedDuringRun($run);
            }

            if ($recoveredLeads !== []) {
                $run->update([
                    'status' => 'completed',
                    'error' => null,
                    'result_summary' => array_merge(
                        is_array($run->result_summary) ? $run->result_summary : [],
                        [
                            'lead_count' => count($recoveredLeads),
                            'soft_completed_on_timeout' => true,
                        ]
                    ),
                    'finished_at' => now(),
                ]);

                $this->finalizePlaceholder(
                    $run,
                    $this->formatRecoveredNarration(count($recoveredLeads)),
                    $recoveredLeads,
                    ['timed_out' => false, 'soft_completed_on_timeout' => true],
                );

                return;
            }

            if (in_array($run->status, ['queued', 'running'], true)) {
                $run->update([
                    'status' => 'failed',
                    'error' => mb_substr($error, 0, 2000),
                    'finished_at' => now(),
                ]);
            }

            $this->finalizePlaceholder(
                $run,
                'Lead search timed out or was interrupted. Please try again — results usually appear within a couple of minutes.',
                null,
                ['timed_out' => true],
            );
        } catch (\Throwable $inner) {
            Log::warning('Failed to mark discovery run as failed after job error', [
                'run_id' => $this->runId,
                'error' => $inner->getMessage(),
            ]);
        }
    }

    /**
     * @param  list<array<string, mixed>>|null  $leads
     * @param  array<string, mixed>  $extraMeta
     */
    private function finalizePlaceholder(
        DiscoveryRun $run,
        string $body,
        ?array $leads,
        array $extraMeta = [],
    ): void {
        $placeholder = ChatMessage::query()
            ->where('role', 'assistant')
            ->where('id', '>', $this->userMessageId)
            ->orderBy('id')
            ->get()
            ->first(fn(ChatMessage $message) => (bool) ($message->meta['pending'] ?? false)
                && (int) ($message->meta['discovery_run_id'] ?? 0) === $this->runId);

        if (! $placeholder) {
            return;
        }

        $meta = array_merge(is_array($placeholder->meta) ? $placeholder->meta : [], [
            'pending' => false,
            'discovery_run_id' => $this->runId,
        ], $extraMeta);

        $payload = [
            'body' => $body,
            'meta' => $meta,
        ];
        if ($leads !== null) {
            $payload['leads'] = $leads;
        }

        $placeholder->update($payload);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recoverLeadsCreatedDuringRun(DiscoveryRun $run): array
    {
        $started = $run->started_at ?? $run->created_at;
        if (! $started || ! $run->icp_profile_id) {
            return [];
        }

        return Lead::query()
            ->where('organization_id', $run->organization_id)
            ->where('icp_profile_id', $run->icp_profile_id)
            ->where('created_at', '>=', $started->copy()->subSeconds(5))
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->map(function (Lead $lead): array {
                $meta = is_array($lead->meta) ? $lead->meta : [];

                return [
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'source' => $lead->source,
                    'score' => $lead->score !== null ? (int) round((float) $lead->score) : null,
                    'summary' => $lead->summary,
                    'title' => $meta['title'] ?? null,
                    'company' => $meta['company'] ?? null,
                    'email' => $meta['email'] ?? null,
                    'phone' => $meta['phone'] ?? null,
                    'linkedin_url' => $meta['linkedin_url'] ?? null,
                    'save_status' => $lead->save_status,
                ];
            })
            ->all();
    }

    private function formatRecoveredNarration(int $count): string
    {
        if ($count === 1) {
            return 'Found 1 prospect before the search window closed. You can generate more prospects for additional results.';
        }

        return "Found {$count} prospects before the search window closed. You can generate more prospects for additional results.";
    }
}
