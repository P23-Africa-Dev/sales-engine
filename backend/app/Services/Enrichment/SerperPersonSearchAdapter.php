<?php

namespace App\Services\Enrichment;

use App\Models\ApiUsage;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SerperPersonSearchAdapter
{
    public function isEnabled(): bool
    {
        return trim((string) config('services.serper.api_key')) !== '';
    }

    /**
     * @return list<array{title: string, snippet: ?string, url: ?string}>
     */
    public function searchPerson(Organization $organization, string $personName, string $contextQuery = ''): array
    {
        if (! $this->isEnabled()) {
            return [];
        }

        $query = trim($personName . ' CEO company LinkedIn official biography');
        if (trim($contextQuery) !== '') {
            $query .= ' ' . trim($contextQuery);
        }

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');

        try {
            $response = Http::timeout(25)
                ->withHeaders([
                    'X-API-KEY' => (string) config('services.serper.api_key'),
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl . '/search', [
                    'q' => $query,
                    'num' => 5,
                ]);

            ApiUsage::query()->create([
                'organization_id' => $organization->id,
                'provider' => 'serper',
                'endpoint' => 'person_enrichment',
                'units' => 1,
                'estimated_cost' => 0.005,
                'meta' => ['status' => $response->status(), 'query' => $query],
            ]);

            if (! $response->successful()) {
                Log::warning('Serper person enrichment failed', ['status' => $response->status()]);

                return [];
            }

            $organic = $response->json('organic') ?? [];
            $results = [];

            foreach ($organic as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $results[] = [
                    'title' => (string) ($item['title'] ?? ''),
                    'snippet' => isset($item['snippet']) ? (string) $item['snippet'] : null,
                    'url' => isset($item['link']) ? (string) $item['link'] : null,
                ];
            }

            return $results;
        } catch (\Throwable $e) {
            Log::warning('Serper person enrichment exception', ['error' => $e->getMessage()]);

            return [];
        }
    }
}
