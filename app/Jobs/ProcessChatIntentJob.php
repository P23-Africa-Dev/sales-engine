<?php

namespace App\Jobs;

use App\Services\Chat\ChatService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessChatIntentJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 180;

    public int $tries = 1;

    public function __construct(
        public int $runId,
        public int $userMessageId,
        public ?string $clientTimezone = null,
    ) {}

    public function handle(ChatService $chat): void
    {
        try {
            $chat->processQueuedIntent($this->runId, $this->userMessageId, $this->clientTimezone);
        } catch (\Throwable $e) {
            Log::error('Chat intent job failed', [
                'run_id' => $this->runId,
                'error' => $e->getMessage(),
            ]);
            $this->failRun($e->getMessage());
            throw $e;
        }
    }

    public function failed(?\Throwable $e): void
    {
        $this->failRun($e?->getMessage() ?? 'Job failed or timed out.');
    }

    private function failRun(string $error): void
    {
        try {
            $run = \App\Models\DiscoveryRun::query()->find($this->runId);
            if ($run && in_array($run->status, ['queued', 'running'], true)) {
                $run->update([
                    'status' => 'failed',
                    'error' => mb_substr($error, 0, 2000),
                    'finished_at' => now(),
                ]);
            }

            $placeholder = \App\Models\ChatMessage::query()
                ->where('role', 'assistant')
                ->where('id', '>', $this->userMessageId)
                ->orderBy('id')
                ->get()
                ->first(fn(\App\Models\ChatMessage $message) => (bool) ($message->meta['pending'] ?? false)
                    && (int) ($message->meta['discovery_run_id'] ?? 0) === $this->runId);

            if ($placeholder) {
                $placeholder->update([
                    'body' => 'Lead search timed out or was interrupted. Please try again — results usually appear within a couple of minutes.',
                    'meta' => array_merge(is_array($placeholder->meta) ? $placeholder->meta : [], [
                        'pending' => false,
                        'discovery_run_id' => $this->runId,
                        'timed_out' => true,
                    ]),
                ]);
            }
        } catch (\Throwable $inner) {
            Log::warning('Failed to mark discovery run as failed after job error', [
                'run_id' => $this->runId,
                'error' => $inner->getMessage(),
            ]);
        }
    }
}
