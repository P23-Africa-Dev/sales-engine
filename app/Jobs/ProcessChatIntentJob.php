<?php

namespace App\Jobs;

use App\Models\ChatMessage;
use App\Models\DiscoveryRun;
use App\Models\Lead;
use App\Services\Chat\ChatService;
use App\Services\Research\ResearchOrchestrator;
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

            // Soft-complete / normal completion already finished the run.
            if ($run->status === 'completed') {
                return;
            }

            $recoveredLeads = [];
            // Timeouts and "attempted too many times" often fire while leads were already
            // persisted — recover before telling the user the search failed.
            $shouldRecover = $wasTimeout
                || str_contains(mb_strtolower($error), 'timed out')
                || str_contains(mb_strtolower($error), 'attempted too many times');

            if ($shouldRecover && in_array($run->status, ['queued', 'running', 'failed'], true)) {
                if ((string) $run->intent === 'quick_research') {
                    $sources = $this->recoverResearchSourcesFromRun($run);
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
                        $this->finalizePlaceholder(
                            $run,
                            $narrative,
                            null,
                            [
                                'timed_out' => false,
                                'soft_completed_on_timeout' => true,
                                'research' => [
                                    'sub_queries' => is_array($run->result_summary['sub_queries'] ?? null)
                                        ? $run->result_summary['sub_queries']
                                        : [],
                                    'sources' => $sources,
                                ],
                            ],
                        );

                        return;
                    }
                }

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
                    'Lead search timed out or was interrupted. Please try again — results usually appear within a couple of minutes.',
                    null,
                    ['timed_out' => true],
                );
            }
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

    /**
     * @return list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>
     */
    private function recoverResearchSourcesFromRun(DiscoveryRun $run): array
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

    private function formatRecoveredNarration(int $count): string
    {
        if ($count === 1) {
            return 'Found 1 prospect before the search window closed. You can generate more prospects for additional results.';
        }

        return "Found {$count} prospects before the search window closed. You can generate more prospects for additional results.";
    }
}
