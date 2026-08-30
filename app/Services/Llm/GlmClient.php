<?php

namespace App\Services\Llm;

use App\Models\ApiUsage;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
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

        $model = match ($purpose) {
            'extract' => (string) config('services.glm.extract_model'),
            'score' => (string) config('services.glm.score_model'),
            'outreach_draft' => (string) config('services.glm.outreach_model'),
            default => (string) config('services.glm.chat_model'),
        };

        if (! empty($options['model'])) {
            $model = (string) $options['model'];
        }

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

        if ($organization) {
            ApiUsage::query()->create([
                'organization_id' => $organization->id,
                'provider' => 'glm',
                'endpoint' => $purpose,
                'units' => 1,
                'estimated_cost' => 0.001,
                'meta' => [
                    'model' => $model,
                    'status' => $response->status(),
                ],
            ]);
        }

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
