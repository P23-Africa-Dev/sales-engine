<?php

namespace App\Services\Extraction;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Llm\GlmClient;

class ExtractionService
{
    public function __construct(private readonly GlmClient $glm) {}

    /**
     * @return array{name?: string, sector?: string, location?: string, summary?: string, business_fields?: array, commercial_signals?: array}
     */
    public function extract(RawDiscoveryHit $hit, IcpBrief $brief, Organization $organization): array
    {
        if (! $this->glm->isConfigured()) {
            return [
                'name' => $hit->name,
                'sector' => $hit->sector,
                'location' => $hit->location,
                'summary' => $hit->snippet ?? $hit->name,
                'business_fields' => ['website' => $hit->website],
                'commercial_signals' => [],
            ];
        }

        try {
            return $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract structured company intelligence as JSON with keys: name, sector, location, summary, business_fields (object), commercial_signals (array of strings). No markdown.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'icp' => [
                            'name' => $brief->name,
                            'industries' => $brief->industries,
                            'territories' => $brief->territories,
                        ],
                        'hit' => [
                            'name' => $hit->name,
                            'snippet' => $hit->snippet,
                            'url' => $hit->url,
                            'website' => $hit->website,
                            'location' => $hit->location,
                            'sector' => $hit->sector,
                            'source' => $hit->source,
                            'provider' => $hit->provider,
                        ],
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);
        } catch (\Throwable) {
            return [
                'name' => $hit->name,
                'sector' => $hit->sector,
                'location' => $hit->location,
                'summary' => $hit->snippet ?? $hit->name,
                'business_fields' => [],
                'commercial_signals' => [],
            ];
        }
    }
}
