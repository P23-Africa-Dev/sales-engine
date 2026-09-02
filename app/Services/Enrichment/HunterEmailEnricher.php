<?php

namespace App\Services\Enrichment;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class HunterEmailEnricher
{
    public function isEnabled(): bool
    {
        return trim((string) config('services.hunter.api_key')) !== '';
    }

    public function findEmail(string $personName, string $domain): ?string
    {
        if (! $this->isEnabled() || trim($domain) === '') {
            return null;
        }

        $parts = preg_split('/\s+/u', trim($personName)) ?: [];
        if (count($parts) < 2) {
            return null;
        }

        $firstName = $parts[0];
        $lastName = end($parts);

        try {
            $response = Http::timeout(15)
                ->get('https://api.hunter.io/v2/email-finder', [
                    'domain' => $domain,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'api_key' => (string) config('services.hunter.api_key'),
                ]);

            if (! $response->successful()) {
                Log::warning('Hunter email finder failed', ['status' => $response->status()]);

                return null;
            }

            $email = trim((string) ($response->json('data.email') ?? ''));
            $score = (int) ($response->json('data.score') ?? 0);

            return $email !== '' && $score >= 70 ? $email : null;
        } catch (\Throwable $e) {
            Log::warning('Hunter email finder exception', ['error' => $e->getMessage()]);

            return null;
        }
    }

    public function extractDomain(?string $website): ?string
    {
        if (! filled($website)) {
            return null;
        }

        $host = parse_url($website, PHP_URL_HOST);

        if (! is_string($host) || $host === '') {
            $host = parse_url('https://' . ltrim($website, '/'), PHP_URL_HOST);
        }

        $host = is_string($host) ? mb_strtolower($host) : null;

        if ($host === null || $host === '') {
            return null;
        }

        return str_starts_with($host, 'www.') ? mb_substr($host, 4) : $host;
    }
}
