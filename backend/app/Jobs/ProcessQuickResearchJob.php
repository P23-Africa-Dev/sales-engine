<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\DiscoveryRun;
use App\Services\Chat\ChatService;
use App\Services\Research\ResearchOrchestrator;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\TimeoutExceededException;
use Illuminate\Support\Facades\Log;

/**
 * Dedicated short-timeout worker for Quick Research so lead-gen jobs cannot
 * block research on the discovery queue.
 */
class ProcessQuickResearchJob implements ShouldQueue
{
    use Queueable;

    /** Hard deadline in ResearchOrchestrator is 45s; keep a small buffer. */
    public int $timeout = 90;

    public int $tries = 1;

    public function __construct(
        public int $runId,
        public int $userMessageId,
        public ?string $clientTimezone = null,
    ) {
        $this->onQueue('research');
    }

    public function handle(ChatService $chat): void
    {
        try {
            $chat->processQueuedIntent($this->runId, $this->userMessageId, $this->clientTimezone);
        } catch (\Throwable $e) {
            Log::error('Quick research job failed', [
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
            $e?->getMessage() ?? 'Quick research job failed or timed out.',
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

            if ($run->status === 'completed') {
                return;
            }

            $shouldRecover = $wasTimeout
                || str_contains(mb_strtolower($error), 'timed out')
                || str_contains(mb_strtolower($error), 'attempted too many times');

            $sources = [];
            if ($shouldRecover && in_array($run->status, ['queued', 'running', 'failed'], true)) {
                $sources = $this->recoverSourcesFromRun($run);
            }

            if ($sources !== []) {
                $query = (string) ($run->query ?? 'your question');
                $narrative = ResearchOrchestrator::formatRecoveredResearchBrief($query, $sources);

                $run->update([
                    'status' => 'completed',
                    'error' => null,
                    'result_summary' => array_merge(
                        is_array($run->result_summary) ? $run->result_summary : [],
                        [
                            'source_count' => count($sources),
                            'sources' => $sources,
                            'soft_completed_on_timeout' => true,
                        ]
                    ),
                    'finished_at' => now(),
                ]);

                $this->finalizePlaceholder($run, $narrative, [
                    'timed_out' => false,
                    'soft_completed_on_timeout' => true,
                    'research' => [
                        'sub_queries' => is_array($run->result_summary['sub_queries'] ?? null)
                            ? $run->result_summary['sub_queries']
                            : [],
                        'sources' => $sources,
                    ],
                ]);

                return;
            }

            if (in_array($run->status, ['queued', 'running'], true)) {
                $run->refresh();
                if ($run->status === 'completed') {
                    return;
                }

                $run->update([
                    'status' => 'failed',
                    'error' => mb_substr($error, 0, 2000),
                    'finished_at' => now(),
                ]);

                $this->finalizePlaceholder(
                    $run,
                    'Research timed out or was interrupted. Please try again. A quick scan usually finishes within about a minute.',
                    ['timed_out' => true],
                );
            }
        } catch (\Throwable $inner) {
            Log::warning('Failed to mark quick research run as failed after job error', [
                'run_id' => $this->runId,
                'error' => $inner->getMessage(),
            ]);
        }
    }

    /**
     * @return list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>
     */
    private function recoverSourcesFromRun(DiscoveryRun $run): array
    {
        $summary = is_array($run->result_summary) ? $run->result_summary : [];
        $sources = $summary['sources'] ?? [];
        if (! is_array($sources) || $sources === []) {
            return [];
        }

        $normalized = [];
        foreach ($sources as $source) {
            if (! is_array($source)) {
                continue;
            }
            $title = trim((string) ($source['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $normalized[] = [
                'title' => $title,
                'url' => isset($source['url']) ? (string) $source['url'] : null,
                'snippet' => isset($source['snippet']) ? (string) $source['snippet'] : null,
                'provider' => isset($source['provider']) ? (string) $source['provider'] : null,
                'icp_relevance_reason' => isset($source['icp_relevance_reason'])
                    ? (string) $source['icp_relevance_reason']
                    : null,
            ];
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $extraMeta
     */
    private function finalizePlaceholder(DiscoveryRun $run, string $body, array $extraMeta = []): void
    {
        $placeholder = ChatMessage::query()
            ->where('role', 'assistant')
            ->where('id', '>', $this->userMessageId)
            ->orderBy('id')
            ->get()
            ->first(fn(ChatMessage $message) => (int) ($message->meta['discovery_run_id'] ?? 0) === $this->runId);

        if (! $placeholder) {
            return;
        }

        $meta = array_merge(is_array($placeholder->meta) ? $placeholder->meta : [], [
            'pending' => false,
            'discovery_run_id' => $this->runId,
            'intent' => 'quick_research',
        ], $extraMeta);

        $placeholder->update([
            'body' => $body,
            'intent' => 'quick_research',
            'meta' => $meta,
        ]);
    }
}
