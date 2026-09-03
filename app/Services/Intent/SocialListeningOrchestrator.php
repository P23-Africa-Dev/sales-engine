<?php

namespace App\Services\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Collection;

class SocialListeningOrchestrator
{
    /** @param  list<SocialSourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly SocialSignalEnricher $enricher,
        private readonly GlmClient $glm,
    ) {}

    public function run(
        Organization $organization,
        IcpProfile $icp,
        SocialListeningSetting $settings,
        ?User $user = null,
        ?SocialListeningRun $existingRun = null,
    ): SocialListeningRun {
        $dailyCap = (int) config('services.social_listening.daily_api_cap', 200);
        if ($dailyCap > 0) {
            // Only count social-listening Serper calls — not discovery/chat/enrichment usage.
            $usageToday = \App\Models\ApiUsage::query()
                ->where('organization_id', $organization->id)
                ->where('provider', 'serper')
                ->where('endpoint', 'like', 'social_%')
                ->whereDate('created_at', today())
                ->count();

            if ($usageToday >= $dailyCap) {
                throw new \RuntimeException('Daily social listening API budget reached for this organization.');
            }
        }

        $run = $existingRun ?? SocialListeningRun::query()->create([
            'organization_id' => $organization->id,
            'icp_profile_id' => $icp->id,
            'user_id' => $user?->id,
            'status' => 'queued',
            'stages' => ['queued'],
            'started_at' => now(),
        ]);

        $run->update(['status' => 'running', 'stages' => ['analyzing_icp']]);

        try {
            $brief = IcpBrief::fromIcpProfile($icp);
            $enabled = $settings->enabled_sources ?? SocialListeningSetting::DEFAULT_SOURCES;
            $queries = $this->buildQueries($organization, $icp, $brief);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources']]);

            $hits = collect();
            foreach ($queries as $query) {
                foreach ($this->sources as $source) {
                    if (! $source->isEnabled($brief, $enabled)) {
                        continue;
                    }
                    $hits = $hits->merge($source->search($brief, $query, $organization->id, 6));
                }
            }

            $uniqueHits = $hits
                ->unique(fn(RawSocialHit $h) => md5(mb_strtolower($h->postUrl ?? $h->postText)))
                ->take(24);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources', 'enriching']]);

            $created = 0;
            /** @var RawSocialHit $hit */
            foreach ($uniqueHits as $hit) {
                $hash = md5(mb_strtolower($hit->postUrl ?? $hit->postText));
                if (SocialSignal::query()
                    ->where('organization_id', $organization->id)
                    ->where('icp_profile_id', $icp->id)
                    ->where('content_hash', $hash)
                    ->exists()
                ) {
                    continue;
                }

                $enriched = $this->enricher->enrich($organization, $icp, $hit);
                $score = (float) ($enriched['score'] ?? 0);

                if ($score < (float) $settings->min_score) {
                    continue;
                }

                if (! $this->matchesIntentFilters($enriched, $settings->intent_filters ?? [])) {
                    continue;
                }

                $intentLabel = (string) ($enriched['intent_label'] ?? 'Recommendation');

                SocialSignal::query()->create([
                    'organization_id' => $organization->id,
                    'icp_profile_id' => $icp->id,
                    'social_listening_run_id' => $run->id,
                    'post_url' => $hit->postUrl,
                    'content_hash' => $hash,
                    'platform' => $hit->platform,
                    'source_label' => $hit->sourceLabel,
                    'source_icon' => $hit->sourceIcon,
                    'post_text' => $hit->postText,
                    'posted_at' => now()->subHours(2),
                    'profile_name' => $enriched['profile_name'] ?? null,
                    'persona' => $enriched['persona'] ?? null,
                    'company_name' => $enriched['company_name'] ?? null,
                    'location_text' => $enriched['location_text'] ?? null,
                    'intent_label' => $intentLabel,
                    'intent_color' => SocialSignalEnricher::intentColor($intentLabel),
                    'intent_description' => $enriched['intent_description'] ?? null,
                    'signal_type' => $enriched['signal_type'] ?? null,
                    'buying_stage' => $enriched['buying_stage'] ?? null,
                    'problem' => $enriched['problem'] ?? null,
                    'urgency' => $enriched['urgency'] ?? null,
                    'score' => $score,
                    'reasons' => $enriched['reasons'] ?? [],
                    'suggested_message' => $enriched['suggested_message'] ?? null,
                    'recommended_action' => $enriched['recommended_action'] ?? null,
                    'status' => 'new',
                    'meta' => ['title' => $hit->title, 'snippet' => $hit->snippet],
                ]);

                $created++;
            }

            $settings->update(['last_run_at' => now()]);

            $run->update([
                'status' => 'completed',
                'signals_created' => $created,
                'result_summary' => "Created {$created} social signals from {$uniqueHits->count()} raw hits.",
                'stages' => ['analyzing_icp', 'searching_sources', 'enriching', 'completed'],
                'finished_at' => now(),
            ]);
        } catch (\Throwable $e) {
            $run->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);
        }

        return $run->fresh();
    }

    /**
     * @return list<string>
     */
    private function buildQueries(Organization $organization, IcpProfile $icp, IcpBrief $brief): array
    {
        if ($this->glm->isConfigured()) {
            try {
                $json = $this->glm->chatJson([
                    [
                        'role' => 'system',
                        'content' => 'Generate 3-5 short Google search queries to find B2B buying-intent social posts matching an ICP. '
                            .'Focus on people asking for recommendations, switching vendors, pricing, tools, or software — NOT job ads, recruiting, or generic thought leadership. '
                            .'Include buying phrases like "looking for", "recommend", "alternative to", "switching from", "how much", "vendor". '
                            .'Return JSON: {"queries":["..."]}',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'industries' => array_values(array_filter($brief->industries, fn ($i) => is_string($i) && mb_strlen(trim($i)) >= 3 && ! in_array(mb_strtolower(trim($i)), ['yes', 'no', 'n/a'], true))),
                            'territories' => $brief->territories,
                            'decision_makers' => $brief->decisionMakers,
                            'custom_prompt' => $brief->customPrompt,
                        ]),
                    ],
                ], 'extract', $organization);

                $queries = $json['queries'] ?? [];
                if (is_array($queries) && count($queries) > 0) {
                    return array_values(array_filter(array_map('strval', $queries)));
                }
            } catch (\Throwable) {
                // fallback below
            }
        }

        $parts = array_filter([
            implode(' ', array_slice($brief->industries, 0, 1)),
            implode(' ', array_slice($brief->territories, 0, 1)),
            'looking for recommendations OR switching OR pricing',
        ]);

        return [trim(implode(' ', $parts))];
    }

    /**
     * @param  array<string, mixed>  $enriched
     * @param  list<string>  $filters
     */
    private function matchesIntentFilters(array $enriched, array $filters): bool
    {
        if ($filters === []) {
            return true;
        }

        $signalType = mb_strtolower(trim((string) ($enriched['signal_type'] ?? '')));
        if ($signalType === '' || $signalType === 'other') {
            return false;
        }

        // Canonical types from SocialSignalEnricher match filter keys 1:1.
        if (in_array($signalType, $filters, true)) {
            return true;
        }

        $map = [
            'recommendation' => ['recommendation', 'recommendations'],
            'switching' => ['switching', 'switch'],
            'pricing' => ['price', 'pricing'],
            'hiring_expansion' => ['hiring', 'expansion', 'growth', 'job'],
        ];

        foreach ($filters as $filter) {
            $needles = $map[$filter] ?? [mb_strtolower((string) $filter)];
            foreach ($needles as $needle) {
                if ($needle !== '' && str_contains($signalType, $needle)) {
                    return true;
                }
            }
        }

        return false;
    }
}
