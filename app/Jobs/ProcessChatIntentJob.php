<?php

namespace App\Jobs;

use App\Services\Chat\ChatService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessChatIntentJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

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
        }
    }
}
