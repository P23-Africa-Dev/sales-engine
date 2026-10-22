<?php

namespace App\Services\Geo;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NominatimGeocoder
{
    /**
     * @return array{latitude: float, longitude: float}|null
     */
    public function geocode(string $query): ?array
    {
        $query = trim($query);
        if ($query === '') {
            return null;
        }

        $agent = trim((string) config('services.nominatim.user_agent'));
        if ($agent === '') {
            return null;
        }

        return Cache::remember('nominatim:'.md5(mb_strtolower($query)), now()->addDay(), function () use ($query, $agent) {
            try {
                $response = Http::timeout(8)
                    ->withHeaders(['User-Agent' => $agent, 'Accept' => 'application/json'])
                    ->get('https://nominatim.openstreetmap.org/search', [
                        'q' => $query,
                        'format' => 'json',
                        'limit' => 1,
                    ]);

                if (! $response->successful()) {
                    return null;
                }

                $row = $response->json('0');
                if (! is_array($row) || ! isset($row['lat'], $row['lon'])) {
                    return null;
                }

                return [
                    'latitude' => (float) $row['lat'],
                    'longitude' => (float) $row['lon'],
                ];
            } catch (\Throwable $e) {
                Log::debug('Nominatim geocode skipped', ['error' => $e->getMessage()]);

                return null;
            }
        });
    }
}
