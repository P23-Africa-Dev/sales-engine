<?php

namespace App\Jobs;

use App\Models\Lead;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * After the first batch: fill country on shown cards with unknown location.
 * Never crawls the raw hit list — only persisted leads from the returned page.
 */
class ResolveLeadLocationJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 45;

    public int $tries = 1;

    public function __construct(public int $leadId)
    {
        $this->onQueue('discovery');
    }

    public function handle(DiscoveryGeo $geo, IcpFilterService $filter): void
    {
        $lead = Lead::query()->find($this->leadId);
        if (! $lead) {
            return;
        }

        $meta = is_array($lead->meta) ? $lead->meta : [];
        $existing = trim((string) ($meta['location'] ?? ''));
        $status = (string) ($meta['location_status'] ?? '');
        if ($existing !== '' && $status !== 'unknown') {
            return;
        }

        $website = trim((string) ($meta['website'] ?? ''));
        $sourceUrl = trim((string) ($meta['source_url'] ?? $meta['linkedin_url'] ?? ''));
        $location = $geo->inferLocationFromTld($website.' '.$sourceUrl);

        if ($location === null) {
            $location = $this->serperHeadquarters($lead->name, $geo);
        }

        if ($location === null || trim($location) === '') {
            return;
        }

        $meta['location'] = $location;
        $meta['location_status'] = 'resolved';

        $icp = $lead->icpProfile;
        if ($icp && IcpBrief::fromIcpProfile($icp)->territories !== []) {
            $brief = IcpBrief::fromIcpProfile($icp);
            $result = $filter->passes(
                $brief,
                new CandidateCompany(territory: $location),
                ['territory'],
            );
            if (! ($result->reasons['territory'] ?? true)) {
                $meta['location_status'] = 'outside_territory';
                $meta['icp_recommended'] = false;
            }
        }

        $lead->update(['meta' => $meta]);
    }

    private function serperHeadquarters(string $name, DiscoveryGeo $geo): ?string
    {
        $name = trim($name);
        $apiKey = trim((string) config('services.serper.api_key'));
        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        if ($name === '' || $apiKey === '' || $baseUrl === '') {
            return null;
        }

        try {
            $response = Http::timeout(20)
                ->withHeaders([
                    'X-API-KEY' => $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post($baseUrl.'/search', [
                    'q' => '"'.$name.'" headquarters',
                    'num' => 5,
                ]);

            if (! $response->successful()) {
                return null;
            }

            $organic = $response->json('organic') ?? [];
            if (! is_array($organic)) {
                return null;
            }

            $haystack = '';
            foreach (array_slice($organic, 0, 5) as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $haystack .= ' '.($row['title'] ?? '').' '.($row['snippet'] ?? '').' '.($row['link'] ?? '');
            }

            return $geo->inferLocationFromText($haystack);
        } catch (\Throwable $e) {
            Log::debug('ResolveLeadLocationJob Serper skipped', [
                'lead_id' => $this->leadId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
