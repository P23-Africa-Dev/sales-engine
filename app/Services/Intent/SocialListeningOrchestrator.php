<?php

namespace App\Services\Intent;

use App\Jobs\EnrichSocialSignalJob;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;
use App\Services\SignalDetection\DTO\DetectedSignal;
use App\Services\SignalDetection\SignalExtractor;
use App\Services\SignalDetection\SignalGroundingGate;
use App\Services\SignalDetection\SignalQueryBuilder;
use App\Services\SignalDetection\SignalTypeRegistry;
use Illuminate\Support\Collection;

class SocialListeningOrchestrator
{
    /**
     * Social Listening extraction only reliably produces industry/location.
     * Size/revenue are evaluated per-candidate when the extractor actually
     * populated them — never fail-closed on fields the pipeline cannot fill.
     */
    private const ICP_FILTER_BASE_FIELDS = ['industry', 'territory'];

    /** @param  list<SocialSourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly SocialSignalEnricher $enricher,
        private readonly GlmClient $glm,
        private readonly SignalFreshnessScorer $freshness = new SignalFreshnessScorer,
        private readonly IcpFilterService $icpFilter = new IcpFilterService,
        private readonly SignalGroundingGate $groundingGate = new SignalGroundingGate,
        private readonly SignalTypeRegistry $signalTypeRegistry = new SignalTypeRegistry,
        private readonly SignalQueryBuilder $signalQueryBuilder = new SignalQueryBuilder,
        private readonly SignalExtractor $signalExtractor = new SignalExtractor,
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
            $usageToday = \App\Models\ApiUsage::query()
                ->where('organization_id', $organization->id)
                ->where(function ($q) {
                    $q->where(function ($inner) {
                        $inner->where('provider', 'serper')
                            ->where('endpoint', 'like', 'social_%');
                    })->orWhere('provider', 'meta_graph');
                })
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
            $settingsWindow = max(1, (int) ($settings->freshness_window_days ?? 180));
            $definitions = $brief->signalTypeDetectionEnabled()
                ? $this->activeDefinitions($organization->id, $brief)
                : collect();
            $searchWindow = $definitions->isNotEmpty()
                ? max($settingsWindow, (int) $definitions->max('default_recency_window_days'))
                : $settingsWindow;
            $tbs = $this->freshness->serperTbs($searchWindow);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources']]);

            $context = [
                'meta_page_ids' => array_values(array_filter(
                    array_map('strval', $settings->meta_page_ids ?? []),
                    fn (string $id) => trim($id) !== ''
                )),
            ];

            $taggedHits = $this->collectHits(
                $organization,
                $icp,
                $brief,
                $enabled,
                $tbs,
                $context,
                $definitions,
            );

            $run->update(['stages' => ['analyzing_icp', 'searching_sources', 'enriching']]);

            $created = 0;
            $icpRejected = 0;
            $typeMismatch = 0;
            $groundingRejected = ['missing_source_url' => 0, 'missing_source_date' => 0, 'stale' => 0];

            foreach ($taggedHits as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                $signalTypeKey = $entry['signalTypeKey'];
                $signalTypeDefinition = $signalTypeKey !== null
                    ? $this->signalTypeRegistry->find($organization->id, $signalTypeKey)
                    : null;

                $detected = null;
                if ($signalTypeDefinition !== null) {
                    $detected = $this->signalExtractor->extract($hit, $signalTypeDefinition, $organization, $brief);
                    if (! $detected->matched) {
                        $typeMismatch++;

                        continue;
                    }
                    if (filled($detected->sourceUrl)) {
                        $hit = new RawSocialHit(
                            platform: $hit->platform,
                            sourceLabel: $hit->sourceLabel,
                            sourceIcon: $hit->sourceIcon,
                            postText: $hit->postText,
                            postUrl: $detected->sourceUrl,
                            snippet: $hit->snippet,
                            title: $hit->title,
                            authorName: $hit->authorName,
                            authorProfileUrl: $hit->authorProfileUrl,
                            postedAt: $detected->sourceDate ?? $hit->postedAt,
                            dateRaw: $hit->dateRaw,
                        );
                    }
                }

                $postedAt = $hit->postedAt ?? $detected?->sourceDate;
                if ($postedAt === null && $hit->postUrl) {
                    $postedAt = app(\App\Services\Intent\LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
                }

                $typeWindow = max(1, (int) ($signalTypeDefinition?->default_recency_window_days ?? $settingsWindow));
                $gateWindow = min($settingsWindow, $typeWindow);
                // Type window is the spec default (often 180). Settings may tighten, never loosen.
                if ($signalTypeDefinition !== null) {
                    $gateWindow = min($settingsWindow, $typeWindow);
                    // Existing rows still defaulted to 14 would hide 6-month events.
                    // Prefer the type window unless the user set a *longer* cap than 31 days
                    // (90/180) as an explicit tighten-or-match. 7/14/30 are treated as
                    // search-ranking hints, not a hard 2-week discard for typed events.
                    if ($settingsWindow <= 31) {
                        $gateWindow = $typeWindow;
                    }
                }

                $gate = $this->groundingGate->admit($hit->postUrl, $postedAt, $gateWindow);
                if (! $gate->admitted) {
                    $groundingRejected[$gate->reason] = ($groundingRejected[$gate->reason] ?? 0) + 1;

                    continue;
                }

                $hash = md5(mb_strtolower($hit->postUrl ?? $hit->postText));
                if (SocialSignal::query()
                    ->where('organization_id', $organization->id)
                    ->where('icp_profile_id', $icp->id)
                    ->where('content_hash', $hash)
                    ->exists()
                ) {
                    continue;
                }

                $enriched = $this->enricher->enrich($organization, $icp, $hit, $signalTypeDefinition);
                $relevance = (float) ($enriched['score'] ?? 0);
                $score = $this->freshness->apply($relevance, $postedAt, $gateWindow);
                $enriched['score'] = $score;
                $enriched['urgency'] = $this->freshness->nudgeUrgency(
                    isset($enriched['urgency']) ? (string) $enriched['urgency'] : null,
                    $postedAt,
                );

                if ($detected !== null) {
                    $enriched = $this->mergeDetectedIntoEnriched($enriched, $detected);
                }

                $availableFields = self::ICP_FILTER_BASE_FIELDS;
                $companySize = trim((string) ($enriched['company_size'] ?? '')) ?: null;
                $revenue = trim((string) ($enriched['revenue'] ?? '')) ?: null;
                if ($companySize !== null) {
                    $availableFields[] = 'companySize';
                }
                if ($revenue !== null) {
                    $availableFields[] = 'revenue';
                }

                $icpFilterResult = $this->icpFilter->passes(
                    $brief,
                    new CandidateCompany(
                        industry: trim((string) ($enriched['industry'] ?? '')) ?: null,
                        companySize: $companySize,
                        revenue: $revenue,
                        territory: trim((string) ($enriched['location_text'] ?? $enriched['territory'] ?? '')) ?: null,
                    ),
                    $settings->icp_filter_enabled ? $availableFields : [],
                );

                if (! $icpFilterResult->passed) {
                    $icpRejected++;

                    continue;
                }

                if ($score < (float) $settings->min_score) {
                    continue;
                }

                if (! $this->matchesIntentFilters($enriched, $settings->intent_filters ?? [])) {
                    continue;
                }

                $intentLabel = (string) ($enriched['intent_label'] ?? 'Recommendation');
                if ($signalTypeDefinition !== null) {
                    $intentLabel = $signalTypeDefinition->label;
                }

                $signal = SocialSignal::query()->create([
                    'organization_id' => $organization->id,
                    'icp_profile_id' => $icp->id,
                    'social_listening_run_id' => $run->id,
                    'post_url' => $hit->postUrl,
                    'content_hash' => $hash,
                    'platform' => $hit->platform,
                    'source_label' => $hit->sourceLabel,
                    'source_icon' => $hit->sourceIcon,
                    'post_text' => $hit->postText,
                    'summary' => $this->clip((string) ($enriched['summary'] ?? ''), 1000),
                    'posted_at' => $postedAt,
                    'profile_name' => $this->clip((string) ($enriched['profile_name'] ?? ''), 255),
                    'author_profile_url' => $this->clip((string) ($enriched['author_profile_url'] ?? $hit->authorProfileUrl ?? ''), 500) ?: null,
                    'persona' => $this->clip((string) ($enriched['persona'] ?? ''), 255),
                    'company_name' => $this->clip((string) ($enriched['company_name'] ?? ''), 255),
                    'entity_type' => $this->clip((string) ($enriched['entity_type'] ?? ''), 16),
                    'industry' => $this->clip((string) ($enriched['industry'] ?? ''), 255),
                    'icp_filter_passed' => $icpFilterResult->passed,
                    'icp_filter_reasons' => $icpFilterResult->reasons,
                    'territory' => $this->clip((string) ($enriched['location_text'] ?? $detected?->territory ?? ''), 255),
                    'signal_type_key' => $signalTypeKey,
                    'named_people' => $enriched['named_people'] ?? [],
                    'key_topics' => $enriched['key_topics'] ?? [],
                    'competitors' => $enriched['competitors'] ?? [],
                    'follow_up_strategy' => $this->clip((string) ($enriched['follow_up_strategy'] ?? ''), 1000),
                    'location_text' => $this->clip((string) ($enriched['location_text'] ?? ''), 255),
                    'intent_label' => $this->clip($intentLabel, 64),
                    'intent_color' => SocialSignalEnricher::intentColor($intentLabel),
                    'intent_description' => $this->clip((string) ($enriched['intent_description'] ?? ''), 1000),
                    'signal_type' => $this->clip((string) ($enriched['signal_type'] ?? ''), 64),
                    'buying_stage' => $this->clip((string) ($enriched['buying_stage'] ?? ''), 64),
                    'problem' => $this->clip((string) ($enriched['problem'] ?? ''), 1000),
                    'urgency' => $this->clip((string) ($enriched['urgency'] ?? ''), 64),
                    'score' => $score,
                    'reasons' => $enriched['reasons'] ?? [],
                    'suggested_message' => $enriched['suggested_message'] ?? null,
                    'recommended_action' => $this->clip((string) ($enriched['recommended_action'] ?? ''), 1000),
                    'recommended_action_title' => $this->clip((string) ($enriched['recommended_action_title'] ?? ''), 255),
                    'recommended_action_detail' => $this->clip((string) ($enriched['recommended_action_detail'] ?? ''), 1000),
                    'why_this_matters_to_you' => $this->clip((string) ($enriched['why_this_matters_to_you'] ?? ''), 1000),
                    'benefits' => $enriched['benefits'] ?? [],
                    'personal_recommended_action_title' => $this->clip((string) ($enriched['personal_recommended_action_title'] ?? ''), 255),
                    'personal_recommended_action_detail' => $this->clip((string) ($enriched['personal_recommended_action_detail'] ?? ''), 1000),
                    'status' => 'new',
                    'enrichment_status' => SocialSignal::ENRICHMENT_NOT_ATTEMPTED,
                    'meta' => [
                        'title' => $hit->title,
                        'snippet' => $hit->snippet,
                        'date_raw' => $hit->dateRaw,
                        'author_name' => $hit->authorName,
                        'author_profile_url' => $hit->authorProfileUrl,
                        'relevance_score' => $relevance,
                        'freshness_factor' => $this->freshness->factor($postedAt, $gateWindow),
                    ],
                ]);

                EnrichSocialSignalJob::dispatch($signal->id);
                $created++;
            }

            $settings->update(['last_run_at' => now()]);

            $groundingRejectedTotal = array_sum($groundingRejected);

            $run->update([
                'status' => 'completed',
                'signals_created' => $created,
                'result_summary' => [
                    'totalChecked' => $taggedHits->count(),
                    'qualified' => $created,
                    'rejected' => [
                        'icpMismatch' => $icpRejected,
                        'missingSourceUrl' => $groundingRejected['missing_source_url'],
                        'missingSourceDate' => $groundingRejected['missing_source_date'],
                        'stale' => $groundingRejected['stale'],
                        'typeMismatch' => $typeMismatch,
                        'total' => $icpRejected + $groundingRejectedTotal + $typeMismatch,
                    ],
                    'enrichment' => [
                        'pending' => $created,
                        'found' => 0,
                        'notFound' => 0,
                    ],
                ],
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
     * @return Collection<int, \App\Models\SignalTypeDefinition>
     */
    private function activeDefinitions(int $organizationId, IcpBrief $brief): Collection
    {
        $cap = max(0, (int) config('services.social_listening.max_signal_type_queries_per_run', 8));
        if ($cap === 0) {
            return collect();
        }

        $this->signalTypeRegistry->ensureDefaults();

        return $this->signalTypeRegistry
            ->activeForPacks($organizationId, $brief->resolvedSignalTypePacks())
            ->take($cap)
            ->values();
    }

    /**
     * @param  Collection<int, \App\Models\SignalTypeDefinition>  $definitions
     * @return Collection<int, array{hit: RawSocialHit, signalTypeKey: ?string}>
     */
    private function collectHits(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        array $enabled,
        string $tbs,
        array $context,
        Collection $definitions,
    ): Collection {
        $taggedHits = [];

        $runGeneral = ! $brief->signalTypeDetectionEnabled();
        if ($runGeneral) {
            foreach ($this->buildQueries($organization, $icp, $brief) as $query) {
                foreach ($this->searchSources($brief, $query, $organization->id, $enabled, $tbs, $context) as $hit) {
                    $taggedHits[] = ['hit' => $hit, 'signalTypeKey' => null];
                }
            }
        }

        foreach ($definitions as $definition) {
            foreach ($this->signalQueryBuilder->buildQueriesForType($definition, $brief) as $query) {
                foreach ($this->searchSources($brief, $query, $organization->id, $enabled, $tbs, $context) as $hit) {
                    $taggedHits[] = ['hit' => $hit, 'signalTypeKey' => $definition->key];
                }
            }
        }

        $byHash = [];
        foreach ($taggedHits as $entry) {
            $hash = md5(mb_strtolower($entry['hit']->postUrl ?? $entry['hit']->postText));
            if (! isset($byHash[$hash]) || ($byHash[$hash]['signalTypeKey'] === null && $entry['signalTypeKey'] !== null)) {
                $byHash[$hash] = $entry;
            }
        }

        return collect(array_values($byHash))->take(24);
    }

    /**
     * @return list<RawSocialHit>
     */
    private function searchSources(
        IcpBrief $brief,
        string $query,
        int $organizationId,
        array $enabled,
        string $tbs,
        array $context,
    ): array {
        $hits = [];
        foreach ($this->sources as $source) {
            if (! $source->isEnabled($brief, $enabled)) {
                continue;
            }
            foreach ($source->search($brief, $query, $organizationId, 6, $tbs, $context) as $hit) {
                $hits[] = $hit;
            }
        }

        return $hits;
    }

    /**
     * @param  array<string, mixed>  $enriched
     * @return array<string, mixed>
     */
    private function mergeDetectedIntoEnriched(array $enriched, DetectedSignal $detected): array
    {
        if ($detected->company) {
            $enriched['company_name'] = $detected->company;
        }
        if ($detected->description) {
            $enriched['summary'] = $detected->description;
        }
        if ($detected->territory) {
            $enriched['location_text'] = $detected->territory;
        }
        if ($detected->industry) {
            $enriched['industry'] = $detected->industry;
        }
        if ($detected->companySize) {
            $enriched['company_size'] = $detected->companySize;
        }
        if ($detected->revenue) {
            $enriched['revenue'] = $detected->revenue;
        }
        if ($detected->namedPeople !== []) {
            $enriched['named_people'] = $detected->namedPeople;
        }

        return $enriched;
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
                        'content' => 'Generate 3-5 short Google search queries to find FRESH social/web posts that are genuine opportunities for a specific user, grounded ONLY in their stated interests (custom_prompt/description) — do not invent industry, territory, or role keywords beyond what those fields say, since a separate filtering step (not this query) is responsible for matching the user\'s firmographic criteria. '
                            . 'Prefer timely language: "past week", "this week", "latest", "just announced", "recent", current year. '
                            . 'Buying-intent phrasing ("looking for", "recommend", "alternative to", "switching from", "how much", "vendor") is ONE valid angle WHEN it matches the user\'s interests — but it is not the only one. '
                            . 'Also generate queries for funding/investment news, market moves, partnerships, competitive moves, and regulatory changes WHEN the custom_prompt/description implies the user cares about those (e.g. investing, market research, deal sourcing). '
                            . 'Do not blanket-exclude thought-leadership or news-style content — only avoid it when it is clearly irrelevant to the stated interests. '
                            . 'Weight custom_prompt heavily: it is the clearest statement of what this user actually wants. If custom_prompt and description are both empty, generate broad, timely opportunity-discovery queries without guessing at unstated criteria. '
                            . 'Prioritize opportunities that would still be actionable now — not historical roundups from months/years ago. '
                            . 'IMPORTANT: Do NOT generate recruiting/job-board queries (hiring, "we\'re hiring", job openings) unless custom_prompt explicitly asks for hiring/talent signals. '
                            . 'Return JSON: {"queries":["..."]}',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'custom_prompt' => $brief->customPrompt,
                            'description' => $brief->description,
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

        $interestPhrase = trim($brief->customPrompt) !== ''
            ? $brief->customPrompt
            : (trim($brief->description) !== '' ? $brief->description : 'new opportunities OR announcements OR funding');

        return [trim($interestPhrase.' past week OR latest OR just announced')];
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
        $discrete = mb_strtolower(trim((string) ($enriched['signal_type_key'] ?? '')));
        if (($signalType === '' || $signalType === 'other') && $discrete === '') {
            return false;
        }

        if (in_array($signalType, $filters, true) || in_array($discrete, $filters, true)) {
            return true;
        }

        $map = [
            'recommendation' => ['recommendation', 'recommendations'],
            'switching' => ['switching', 'switch'],
            'pricing' => ['price', 'pricing'],
            'hiring_expansion' => ['hiring', 'expansion', 'growth', 'job'],
            'investment_opportunity' => ['investment', 'invest'],
            'funding_event' => ['funding', 'fundraise', 'raise'],
            'market_signal' => ['market'],
            'partnership_opportunity' => ['partnership', 'partner'],
            'competitive_move' => ['competitive', 'competitor'],
            'regulatory_change' => ['regulatory', 'regulation'],
        ];

        foreach ($filters as $filter) {
            $needles = $map[$filter] ?? [mb_strtolower((string) $filter)];
            foreach ($needles as $needle) {
                if ($needle !== '' && (str_contains($signalType, $needle) || str_contains($discrete, $needle))) {
                    return true;
                }
            }
        }

        return false;
    }

    private function clip(?string $value, int $max): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return mb_strlen($value) <= $max ? $value : mb_substr($value, 0, $max);
    }
}
