<?php

namespace App\Services\Llm;

use App\Models\ApiUsage;
use App\Models\Organization;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class GlmClient
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.glm.api_key')) !== '';
    }

    /**
     * @param  list<array{role: string, content: string}>  $messages
     */
    public function chat(
        array $messages,
        string $purpose = 'chat',
        ?Organization $organization = null,
        array $options = [],
    ): string {
        if (! $this->isConfigured()) {
            throw new RuntimeException('GLM_API_KEY is not configured.');
        }

        $model = $this->resolveModel($purpose, $options);
        $baseUrl = rtrim((string) config('services.glm.base_url'), '/');

        $response = Http::timeout((int) ($options['timeout'] ?? 60))
            ->connectTimeout(15)
            ->withToken((string) config('services.glm.api_key'))
            ->post($baseUrl.'/chat/completions', [
                'model' => $model,
                'max_tokens' => (int) ($options['max_tokens'] ?? 2000),
                'temperature' => (float) ($options['temperature'] ?? 0.2),
                'messages' => $messages,
            ]);

        $this->recordUsage($organization, $purpose, $model, $response->status());

        if (! $response->successful()) {
            throw new RuntimeException('GLM request failed: '.$response->body());
        }

        $content = $response->json('choices.0.message.content');
        if (! is_string($content) || trim($content) === '') {
            throw new RuntimeException('GLM returned an empty completion.');
        }

        return trim($content);
    }

    /**
     * @return array<string, mixed>
     */
    public function chatJson(
        array $messages,
        string $purpose = 'extract',
        ?Organization $organization = null,
        array $options = [],
    ): array {
        $raw = $this->chat($messages, $purpose, $organization, $options);
        $json = $this->extractJson($raw);
        if ($json === null) {
            throw new RuntimeException('GLM did not return valid JSON.');
        }

        return $json;
    }

    /**
     * Run several completions concurrently. One request per candidate, issued serially,
     * was the wall-clock ceiling on how many candidates a discovery run could process.
     *
     * @param  array<int|string, array{messages: list<array{role: string, content: string}>, options?: array<string, mixed>}>  $requests
     * @return array<int|string, array<string, mixed>|null>  Same keys as $requests; null where the call failed.
     */
    public function chatJsonPool(
        array $requests,
        string $purpose = 'extract',
        ?Organization $organization = null,
        array $options = [],
    ): array {
        if (! $this->isConfigured() || $requests === []) {
            return [];
        }

        $baseUrl = rtrim((string) config('services.glm.base_url'), '/');
        $apiKey = (string) config('services.glm.api_key');

        $responses = Http::pool(function ($pool) use ($requests, $baseUrl, $apiKey, $purpose, $options) {
            foreach ($requests as $key => $request) {
                $requestOptions = array_merge($options, $request['options'] ?? []);

                $pool->as((string) $key)
                    ->timeout((int) ($requestOptions['timeout'] ?? 60))
                    ->connectTimeout(15)
                    ->withToken($apiKey)
                    ->post($baseUrl.'/chat/completions', [
                        'model' => $this->resolveModel($purpose, $requestOptions),
                        'max_tokens' => (int) ($requestOptions['max_tokens'] ?? 2000),
                        'temperature' => (float) ($requestOptions['temperature'] ?? 0.2),
                        'messages' => $request['messages'] ?? [],
                    ]);
            }
        });

        $model = $this->resolveModel($purpose, $options);
        $out = [];

        foreach (array_keys($requests) as $key) {
            $out[$key] = null;
            $response = $responses[(string) $key] ?? null;

            if (! $response instanceof Response) {
                Log::warning('GLM pooled request failed', [
                    'purpose' => $purpose,
                    'error' => $response instanceof \Throwable ? $response->getMessage() : 'no response',
                ]);

                continue;
            }

            $this->recordUsage($organization, $purpose, $model, $response->status());

            if (! $response->successful()) {
                Log::warning('GLM pooled request returned an error', [
                    'purpose' => $purpose,
                    'status' => $response->status(),
                    'body' => mb_substr($response->body(), 0, 240),
                ]);

                continue;
            }

            $content = $response->json('choices.0.message.content');
            if (! is_string($content) || trim($content) === '') {
                continue;
            }

            $out[$key] = $this->extractJson(trim($content));
        }

        return $out;
    }

    private function resolveModel(string $purpose, array $options = []): string
    {
        if (! empty($options['model'])) {
            return (string) $options['model'];
        }

        return match ($purpose) {
            'extract' => (string) config('services.glm.extract_model'),
            'score' => (string) config('services.glm.score_model'),
            'outreach_draft' => (string) config('services.glm.outreach_model'),
            default => (string) config('services.glm.chat_model'),
        };
    }

    private function recordUsage(?Organization $organization, string $purpose, string $model, int $status): void
    {
        if (! $organization) {
            return;
        }

        try {
            ApiUsage::query()->create([
                'organization_id' => $organization->id,
                'provider' => 'glm',
                'endpoint' => $purpose,
                'units' => 1,
                'estimated_cost' => 0.001,
                'meta' => [
                    'model' => $model,
                    'status' => $status,
                ],
            ]);
        } catch (\Throwable $e) {
            Log::debug('GLM ApiUsage write skipped', ['error' => $e->getMessage()]);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function extractJson(string $raw): ?array
    {
        $trimmed = trim($raw);
        if (str_starts_with($trimmed, '```')) {
            $trimmed = preg_replace('/^```(?:json)?\s*/i', '', $trimmed) ?? $trimmed;
            $trimmed = preg_replace('/\s*```$/', '', $trimmed) ?? $trimmed;
        }

        $decoded = json_decode($trimmed, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        if (preg_match('/\{.*\}/s', $trimmed, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }
}
