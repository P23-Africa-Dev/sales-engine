<?php

namespace App\Services\Intent;

use App\Jobs\EnrichSocialSignalJob;
use App\Models\ApiUsage;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use App\Services\Intent\Contracts\SocialSourceInterface;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;
use App\Services\SignalDetection\DTO\DetectedSignal;
use App\Services\SignalDetection\IcpOpportunityQueryBuilder;
use App\Services\SignalDetection\SignalExtractor;
use App\Services\SignalDetection\SignalGroundingGate;
use App\Services\SignalDetection\SignalQueryBuilder;
use App\Services\SignalDetection\SignalTypeRegistry;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class SocialListeningOrchestrator
{
    /**
     * Social Listening extraction only reliably produces industry/location.
     * Size/revenue are evaluated per-candidate when the extractor actually
     * populated them — never fail-closed on fields the pipeline cannot fill.
     */
    private const MAX_SEARCH_CALLS = 12;

    private const SURVIVOR_TARGET = 20;

    private const LOW_YIELD_FLOOR = 8;

    private const ENRICH_CAP = 12;

    /** @var list<string> */
    private const FULL_TEXT_SOURCES = ['reddit_native', 'x_native'];

    /** @var list<string> */
    private const PRIMARY_SOURCES = ['reddit', 'x_mentions'];

    /** @var list<string> */
    private const LOW_YIELD_SOURCES = ['linkedin_public', 'meta_pages'];

    /** @var list<string> */
    private const LAST_RESORT_SOURCES = ['youtube', 'meta_graph_pages'];

    private bool $budgetExhausted = false;

    private int $apiCallsThisRun = 0;

    private int $usageAtStart = 0;

    private int $dailyCap = 0;

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
        private readonly IcpOpportunityQueryBuilder $opportunityQueries = new IcpOpportunityQueryBuilder,
        private readonly ListeningProfileFactory $profiles = new ListeningProfileFactory,
        private readonly OpportunityPrefilter $prefilter = new OpportunityPrefilter,
        private readonly OpportunityGate $opportunityGate = new OpportunityGate,
        private readonly RedditPostHydrator $redditHydrator = new RedditPostHydrator,
    ) {}

    public function run(
        Organization $organization,
        IcpProfile $icp,
        SocialListeningSetting $settings,
        ?User $user = null,
        ?SocialListeningRun $existingRun = null,
    ): SocialListeningRun {
        $health = app(SocialSourceHealth::class);
        $health->reset();
        $this->budgetExhausted = false;
        $this->apiCallsThisRun = 0;
        $this->dailyCap = (int) config('services.social_listening.daily_api_cap', 200);
        $this->usageAtStart = 0;
        if ($this->dailyCap > 0) {
            $this->usageAtStart = ApiUsage::query()
                ->where('organization_id', $organization->id)
                ->where(function ($q) {
                    $q->where(function ($inner) {
                        $inner->where('provider', 'serper')
                            ->where('endpoint', 'like', 'social_%');
                    })->orWhereIn('provider', ['meta_graph', 'youtube', 'x', 'reddit']);
                })
                ->whereDate('created_at', today())
                ->count();

            if ($this->usageAtStart >= $this->dailyCap) {
                $this->budgetExhausted = true;
                $health->budgetExhausted = true;
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
            $profile = $this->profiles->make($organization, $brief);
            $enabled = $settings->enabled_sources ?? SocialListeningSetting::DEFAULT_SOURCES;
            $requestedWindow = max(1, (int) ($settings->freshness_window_days ?? 30));
            $appliedWindow = min($requestedWindow, 30);
            $definitions = $brief->signalTypeDetectionEnabled()
                ? $this->activeDefinitions($organization->id, $brief)
                : collect();
            $searchWindow = $appliedWindow;
            $tbs = $this->freshness->serperTbs($searchWindow);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources']]);

            $context = [
                'meta_page_ids' => array_values(array_filter(
                    array_map('strval', $settings->meta_page_ids ?? []),
                    fn (string $id) => trim($id) !== ''
                )),
            ];

            $this->noteSourceAvailability($enabled, $context);

            $taggedHits = $this->collectHits(
                $organization,
                $brief,
                $profile,
                $enabled,
                $tbs,
                $context,
                $definitions,
                $searchWindow,
            );

            $run->update(['stages' => ['analyzing_icp', 'searching_sources', 'enriching']]);

            $created = 0;
            $icpRejected = 0;
            $unlabeled = 0;
            $belowMinScore = 0;
            $duplicate = 0;
            $notActionable = 0;
            $modelUnavailable = ! $this->glm->isConfigured();
            $groundingRejected = ['missing_source_url' => 0, 'missing_source_date' => 0, 'stale' => 0];
            $ready = [];
            $hydrations = 0;

            foreach ($taggedHits as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                if ($hydrations < 8 && preg_match('#reddit\.com#i', (string) $hit->postUrl)) {
                    $hit = $this->redditHydrator->hydrate($hit);
                    $hydrations++;
                }

                $postedAt = $hit->postedAt;
                if ($postedAt === null && $hit->postUrl) {
                    $postedAt = app(LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
                }

                $gate = $this->groundingGate->admit(
                    $hit->postUrl,
                    $postedAt,
                    $appliedWindow,
                    null,
                    allowInferredDate: false,
                );
                if (! $gate->admitted) {
                    $groundingRejected[$gate->reason] = ($groundingRejected[$gate->reason] ?? 0) + 1;

                    continue;
                }

                if ($this->prefilter->rejection($hit, $profile) !== null) {
                    $notActionable++;

                    continue;
                }

                $ready[] = [
                    'hit' => $hit,
                    'signalTypeKey' => $entry['signalTypeKey'],
                    'postedAt' => $postedAt,
                ];
            }

            $ready = $this->rankReady($ready, $profile);
            if (count($ready) > self::ENRICH_CAP) {
                $notActionable += count($ready) - self::ENRICH_CAP;
                $ready = array_slice($ready, 0, self::ENRICH_CAP);
            }

            foreach ($ready as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                $postedAt = $entry['postedAt'];
                $signalTypeKey = $entry['signalTypeKey'];
                $signalTypeDefinition = $signalTypeKey !== null
                    ? $this->signalTypeRegistry->find($organization->id, $signalTypeKey)
                    : null;

                if ($modelUnavailable) {
                    $notActionable++;

                    continue;
                }

                $detected = null;
                if ($signalTypeDefinition !== null) {
                    $detected = $this->signalExtractor->extract($hit, $signalTypeDefinition, $organization, $brief);
                    if (! $detected->matched) {
                        $unlabeled++;
                        $signalTypeKey = null;
                        $signalTypeDefinition = null;
                        $detected = null;
                    } elseif (filled($detected->sourceUrl)) {
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
                            fullText: $hit->fullText,
                        );
                        $postedAt = $hit->postedAt ?? $postedAt;
                    }
                }

                $hash = md5(mb_strtolower($hit->postUrl ?? $hit->postText));
                if (SocialSignal::query()
                    ->where('organization_id', $organization->id)
                    ->where('icp_profile_id', $icp->id)
                    ->where('content_hash', $hash)
                    ->exists()
                ) {
                    $duplicate++;

                    continue;
                }

                $enriched = $this->enricher->enrich($organization, $icp, $hit, $signalTypeDefinition);
                $relevance = (float) ($enriched['score'] ?? 0);
                $score = $this->freshness->apply($relevance, $postedAt, $appliedWindow);
                $enriched['score'] = $score;
                $enriched['urgency'] = $this->freshness->nudgeUrgency(
                    isset($enriched['urgency']) ? (string) $enriched['urgency'] : null,
                    $postedAt,
                );

                if ($detected !== null) {
                    $enriched = $this->mergeDetectedIntoEnriched($enriched, $detected);
                }

                $quoteHaystack = trim($hit->postText."\n".($hit->title ?? '')."\n".($hit->snippet ?? ''));
                if ($this->opportunityGate->rejection($enriched, $quoteHaystack, $profile) !== null) {
                    $notActionable++;

                    continue;
                }

                $icpFilterResult = $this->icpFilter->passes(
                    $brief,
                    new CandidateCompany(
                        industry: null,
                        companySize: null,
                        revenue: null,
                        territory: null,
                    ),
                    [],
                );

                if ($score < (float) $settings->min_score) {
                    $belowMinScore++;

                    continue;
                }

                if (! $this->matchesIntentFilters($enriched, $settings->intent_filters ?? [])) {
                    $notActionable++;

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
                    'buying_stage' => $this->normalizeBuyingStage((string) ($enriched['buying_stage'] ?? '')),
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
                        'date_confidence' => 'parsed',
                        'author_name' => $hit->authorName,
                        'author_profile_url' => $hit->authorProfileUrl,
                        'relevance_score' => $relevance,
                        'freshness_factor' => $this->freshness->factor($postedAt, $appliedWindow),
                        'evidence_quote' => $enriched['evidence_quote'] ?? null,
                        'actionability' => $enriched['actionability'] ?? null,
                        'listening_mode' => $profile->mode,
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
                        'typeMismatch' => 0,
                        'belowMinScore' => $belowMinScore,
                        'duplicate' => $duplicate,
                        'notActionable' => $notActionable,
                        'total' => $icpRejected + $groundingRejectedTotal + $belowMinScore + $duplicate + $notActionable,
                    ],
                    'unlabeled' => $unlabeled,
                    'budget_exhausted' => $this->budgetExhausted,
                    'model_unavailable' => $modelUnavailable,
                    'freshnessWindowRequested' => $requestedWindow,
                    'freshnessWindowApplied' => $appliedWindow,
                    'listeningProfile' => $profile->toSummary(),
                    'sources' => app(SocialSourceHealth::class)->snapshot(),
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
     * @return Collection<int, SignalTypeDefinition>
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
     * @param  Collection<int, SignalTypeDefinition>  $definitions
     * @param  list<string>  $enabled
     * @param  array<string, mixed>  $context
     * @return Collection<int, array{hit: RawSocialHit, signalTypeKey: ?string}>
     */
    private function collectHits(
        Organization $organization,
        IcpBrief $brief,
        ListeningProfile $profile,
        array $enabled,
        string $tbs,
        array $context,
        Collection $definitions,
        int $windowDays,
    ): Collection {
        $queries = [];
        foreach ($this->opportunityQueries->fromProfile($profile) as $query) {
            $queries[] = ['query' => $query, 'signalTypeKey' => null];
        }
        foreach ($definitions as $definition) {
            foreach ($this->signalQueryBuilder->buildQueriesForType($definition, $brief) as $query) {
                $queries[] = ['query' => $query, 'signalTypeKey' => $definition->key];
            }
        }

        $byKey = [];
        foreach ($this->sources as $source) {
            $byKey[$source->key()] = $source;
        }

        $tagged = [];
        $seen = [];
        $survivors = 0;
        $calls = 0;

        $absorb = function (array $hits, ?string $signalTypeKey) use (&$tagged, &$seen, &$survivors, $profile, $windowDays): void {
            foreach ($hits as $hit) {
                $hash = md5(mb_strtolower($hit->postUrl ?? $hit->postText));
                if (array_key_exists($hash, $seen)) {
                    if ($seen[$hash] === null && $signalTypeKey !== null) {
                        foreach ($tagged as $index => $existing) {
                            $existingHash = md5(mb_strtolower($existing['hit']->postUrl ?? $existing['hit']->postText));
                            if ($existingHash === $hash) {
                                $tagged[$index]['signalTypeKey'] = $signalTypeKey;
                                $seen[$hash] = $signalTypeKey;
                                break;
                            }
                        }
                    }

                    continue;
                }
                $seen[$hash] = $signalTypeKey;
                $tagged[] = ['hit' => $hit, 'signalTypeKey' => $signalTypeKey];
                if ($this->survives($hit, $profile, $windowDays)) {
                    $survivors++;
                }
            }
        };

        $searchPhase = function (array $keys, bool $requireListed) use (
            &$calls,
            &$survivors,
            $absorb,
            $byKey,
            $brief,
            $organization,
            $enabled,
            $tbs,
            $context,
            $queries,
        ): void {
            foreach ($queries as $planned) {
                foreach ($keys as $key) {
                    if ($calls >= self::MAX_SEARCH_CALLS || $survivors >= self::SURVIVOR_TARGET) {
                        return;
                    }
                    $source = $byKey[$key] ?? null;
                    if (! $source instanceof SocialSourceInterface || ! $source->isConfigured()) {
                        continue;
                    }
                    if ($requireListed && ! in_array($key, $enabled, true)) {
                        continue;
                    }
                    if (! $requireListed && ! $source->isEnabled($brief, $enabled)) {
                        continue;
                    }
                    if ($key === 'meta_graph_pages' && ($context['meta_page_ids'] ?? []) === []) {
                        continue;
                    }
                    if (! $this->canSpendCall()) {
                        return;
                    }
                    $this->apiCallsThisRun++;
                    $calls++;
                    try {
                        $hits = $source->search($brief, $planned['query'], $organization->id, 6, $tbs, $context)->all();
                    } catch (\Throwable $e) {
                        app(SocialSourceHealth::class)->recordAttempt($source->key(), 0, 0);
                        Log::warning('Social source search failed', [
                            'source' => $source->key(),
                            'error' => $e->getMessage(),
                        ]);
                        $hits = [];
                    }
                    $absorb($hits, $planned['signalTypeKey']);
                }
            }
        };

        $searchPhase(self::FULL_TEXT_SOURCES, false);
        $searchPhase(self::PRIMARY_SOURCES, true);
        if ($survivors < self::LOW_YIELD_FLOOR && $calls < self::MAX_SEARCH_CALLS) {
            $searchPhase(self::LOW_YIELD_SOURCES, true);
        }
        if ($survivors === 0 && $calls < self::MAX_SEARCH_CALLS) {
            $searchPhase(self::LAST_RESORT_SOURCES, true);
        }

        return collect($tagged);
    }

    private function survives(RawSocialHit $hit, ListeningProfile $profile, int $windowDays): bool
    {
        $postedAt = $hit->postedAt;
        if ($postedAt === null && $hit->postUrl) {
            $postedAt = app(LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
        }

        $gate = $this->groundingGate->admit($hit->postUrl, $postedAt, $windowDays, null, false);
        if (! $gate->admitted) {
            return false;
        }

        return $this->prefilter->accepts($hit, $profile);
    }

    /**
     * @param  list<array{hit: RawSocialHit, signalTypeKey: ?string, postedAt: mixed}>  $ready
     * @return list<array{hit: RawSocialHit, signalTypeKey: ?string, postedAt: mixed}>
     */
    private function rankReady(array $ready, ListeningProfile $profile): array
    {
        $tokens = array_values(array_filter(
            preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($profile->offer)) ?: [],
            static fn ($word) => mb_strlen((string) $word) >= 4,
        ));

        usort($ready, function (array $a, array $b) use ($tokens, $profile): int {
            return $this->readyRank($b['hit'], $tokens, $profile) <=> $this->readyRank($a['hit'], $tokens, $profile);
        });

        return $ready;
    }

    /**
     * @param  list<string>  $tokens
     */
    private function readyRank(RawSocialHit $hit, array $tokens, ListeningProfile $profile): int
    {
        $text = mb_strtolower($hit->postText.' '.$hit->title);
        $rank = $hit->postedAt !== null ? 3 : 0;
        $rank += $this->prefilter->hasCue($text, $profile) ? 5 : 0;
        foreach ($tokens as $token) {
            if (str_contains($text, $token)) {
                $rank++;
            }
        }

        return $rank;
    }

    /**
     * @param  list<string>  $enabled
     * @param  array<string, mixed>  $context
     */
    private function noteSourceAvailability(array $enabled, array $context): void
    {
        $health = app(SocialSourceHealth::class);
        $pageIds = $context['meta_page_ids'] ?? [];

        foreach ($this->sources as $source) {
            $listed = in_array($source->key(), $enabled, true) || $source->activatesWhenConfigured();
            if ($source->key() === 'meta_graph_pages') {
                if (! $source->isConfigured()) {
                    $health->mark($source->key(), SocialSourceHealth::MISSING_KEY, SocialSourceHealth::MISSING_KEY);

                    continue;
                }
                if ($pageIds === [] || ! in_array($source->key(), $enabled, true)) {
                    $health->mark($source->key(), $pageIds === [] ? SocialSourceHealth::NEEDS_PAGE_IDS : SocialSourceHealth::DISABLED, $pageIds === [] ? SocialSourceHealth::NEEDS_PAGE_IDS : null);

                    continue;
                }
            }

            if (! $listed) {
                $health->mark($source->key(), SocialSourceHealth::DISABLED);

                continue;
            }

            if (! $source->isConfigured()) {
                $health->mark($source->key(), SocialSourceHealth::MISSING_KEY, SocialSourceHealth::MISSING_KEY);
            }
        }
    }

    private function canSpendCall(): bool
    {
        if ($this->budgetExhausted) {
            return false;
        }

        if ($this->dailyCap > 0 && ($this->usageAtStart + $this->apiCallsThisRun) >= $this->dailyCap) {
            $this->budgetExhausted = true;
            app(SocialSourceHealth::class)->budgetExhausted = true;

            return false;
        }

        return true;
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

    private function normalizeBuyingStage(string $value): string
    {
        $allowed = ['Awareness', 'Consideration', 'Vendor Evaluation', 'Decision'];
        foreach ($allowed as $stage) {
            if (strcasecmp(trim($value), $stage) === 0) {
                return $stage;
            }
        }

        return 'Consideration';
    }
}
