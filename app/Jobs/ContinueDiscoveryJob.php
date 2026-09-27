<?php

namespace App\Jobs;

use App\Services\Chat\ChatService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ContinueDiscoveryJob implements ShouldQueue
{
    use Queueable;

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
            $chat->continueDiscovery($this->runId, $this->userMessageId, $this->clientTimezone);
        } catch (\Throwable $e) {
            Log::error('Continue discovery job failed', [
                'run_id' => $this->runId,
                'error' => $e->getMessage(),
            ]);
            $chat->finalizeContinuedDiscovery($this->runId, $this->userMessageId);
            throw $e;
        }
    }

    public function failed(?\Throwable $e): void
    {
        try {
            app(ChatService::class)->finalizeContinuedDiscovery($this->runId, $this->userMessageId);
        } catch (\Throwable) {
            // Best-effort: leave the first page visible rather than wipe it.
        }
    }
}
