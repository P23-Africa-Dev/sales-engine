<?php

namespace App\Services\Enrichment;

use App\Models\EnrichmentLog;
use App\Models\Organization;
use Illuminate\Support\Facades\Log;

class EnrichmentUsageTracker
{
    /**
     * @param  array<string, mixed>  $meta
     */
    public function logEnrichment(
        Organization $organization,
        string $tier,
        string $provider,
        bool $foundEmail,
        bool $foundPhone,
        int $creditsUsed = 0,
        ?string $personName = null,
        ?int $leadId = null,
        array $meta = [],
    ): void {
        try {
            EnrichmentLog::query()->create([
                'organization_id' => $organization->id,
                'lead_id' => $leadId,
                'person_name' => $personName !== null ? mb_substr($personName, 0, 255) : null,
                'tier' => $tier,
                'provider' => $provider,
                'found_email' => $foundEmail,
                'found_phone' => $foundPhone,
                'credits_used' => max(0, $creditsUsed),
                'meta' => $meta !== [] ? $meta : null,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to write enrichment log', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
