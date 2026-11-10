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
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SocialListeningOrchestrator
{
    /*
     * Run budgets. Each is overridable via config('services.social_listening.*')
     * so cost/yield can be tuned per environment without a deploy.
     */
    private const DEFAULT_MAX_SEARCH_CALLS = 30;

    private const DEFAULT_SURVIVOR_TARGET = 45;

    private const DEFAULT_ENRICH_CAP = 25;

    private const DEFAULT_HYDRATE_CAP = 20;

    private const RESULTS_PER_QUERY = 10;

    private const LOW_YIELD_FLOOR = 8;

    /** Native APIs return full text and exact dates, so they are asked first. */
    private const FULL_TEXT_SOURCES = ['reddit_native', 'x_native'];

    /** Search-engine sources, in rough order of buyer-intent yield. */
    private const PRIMARY_SOURCES = ['reddit', 'x_mentions', 'linkedin_public'];

    private const LOW_YIELD_SOURCES = ['meta_pages'];

    private const LAST_RESORT_SOURCES = ['youtube', 'meta_graph_pages'];

    private const ROTATION_TTL_DAYS = 30;

    private const MAX_FRESHNESS_WINDOW_DAYS = 30;

    private bool $budgetExhausted = false;

    private int $apiCallsThisRun = 0;

    private int $usageAtStart = 0;

    private int $dailyCap = 0;

    /** @var list<array{source: string, family: string, query: string, hits: int}> */
    private array $queryLog = [];

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
        $this->queryLog = [];
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
            // Listen Settings offers 7, 14 or 30 days: an opening older than a
            // month is rarely one to reply to. Older rows saved with 90/180 are
            // treated as 30, matching what the settings screen now shows.
            $requestedWindow = max(1, (int) ($settings->freshness_window_days ?? 30));
            $appliedWindow = min($requestedWindow, self::MAX_FRESHNESS_WINDOW_DAYS);
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
                $icp,
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
            /** @var array<string, int> $rejectedDetail */
            $rejectedDetail = [];
            $ready = [];

            // Drop posts already surfaced for this ICP before any hydration or
            // model call is spent on them — one query, not one per hit.
            $seenHashes = $this->knownHashes($organization->id, $icp->id, $taggedHits);
            $feedback = SocialListeningFeedback::forIcp($organization->id, $icp->id);
            $candidates = [];
            foreach ($taggedHits as $entry) {
                if (isset($seenHashes[$this->hashFor($entry['hit'])])) {
                    $duplicate++;

                    continue;
                }
                $muted = $feedback->muteReason($entry['hit']);
                if ($muted !== null) {
                    $notActionable++;
                    $rejectedDetail[$muted] = ($rejectedDetail[$muted] ?? 0) + 1;

                    continue;
                }
                $candidates[] = $entry;
            }

            $candidates = $this->hydrateReddit($candidates);

            foreach ($candidates as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];

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

                $reason = $this->prefilter->rejection($hit, $profile);
                if ($reason !== null) {
                    $notActionable++;
                    $rejectedDetail[$reason] = ($rejectedDetail[$reason] ?? 0) + 1;

                    continue;
                }

                $ready[] = [
                    'hit' => $hit,
                    'signalTypeKey' => $entry['signalTypeKey'],
                    'family' => $entry['family'] ?? null,
                    'postedAt' => $postedAt,
                ];
            }

            $ready = $this->rankReady($ready, $profile);
            $enrichCap = $this->budget('max_enrich_per_run', self::DEFAULT_ENRICH_CAP);
            if (count($ready) > $enrichCap) {
                $overflow = count($ready) - $enrichCap;
                $notActionable += $overflow;
                $rejectedDetail['over_enrich_cap'] = $overflow;
                $ready = array_slice($ready, 0, $enrichCap);
            }

            if ($modelUnavailable) {
                $notActionable += count($ready);
                $ready = [];
            }

            $prepared = [];
            foreach ($ready as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                $postedAt = $entry['postedAt'];
                $signalTypeKey = $entry['signalTypeKey'];
                $signalTypeDefinition = $signalTypeKey !== null
                    ? $this->signalTypeRegistry->find($organization->id, $signalTypeKey)
                    : null;

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

                $prepared[] = [
                    'hit' => $hit,
                    'postedAt' => $postedAt,
                    'signalTypeKey' => $signalTypeKey,
                    'definition' => $signalTypeDefinition,
                    'detected' => $detected,
                    'family' => $entry['family'],
                ];
            }

            $enrichedAll = $prepared === [] ? [] : $this->enricher->enrichMany(
                $organization,
                $icp,
                array_map(static fn (array $item) => ['hit' => $item['hit'], 'signalType' => $item['definition']], $prepared),
                $profile,
            );

            foreach ($prepared as $index => $item) {
                /** @var RawSocialHit $hit */
                $hit = $item['hit'];
                $postedAt = $item['postedAt'];
                $signalTypeKey = $item['signalTypeKey'];
                $signalTypeDefinition = $item['definition'];
                $detected = $item['detected'];

                $hash = $this->hashFor($hit);
                if (isset($seenHashes[$hash]) || SocialSignal::query()
                    ->where('organization_id', $organization->id)
                    ->where('icp_profile_id', $icp->id)
                    ->where('content_hash', $hash)
                    ->exists()
                ) {
                    $duplicate++;

                    continue;
                }

                $enriched = $enrichedAll[$index] ?? [];
                $relevance = (float) ($enriched['score'] ?? 0);
                $score = $this->freshness->apply($relevance, $postedAt, $appliedWindow);
                // Learn from the user's own dismissals and saves for this ICP.
                $score = $feedback->adjustScore($score, isset($enriched['intent_label']) ? (string) $enriched['intent_label'] : null);
                $enriched['score'] = $score;
                $enriched['urgency'] = $this->freshness->nudgeUrgency(
                    isset($enriched['urgency']) ? (string) $enriched['urgency'] : null,
                    $postedAt,
                );

                if ($detected !== null) {
                    $enriched = $this->mergeDetectedIntoEnriched($enriched, $detected);
                }

                $quoteHaystack = trim($hit->postText."\n".($hit->title ?? '')."\n".($hit->snippet ?? ''));
                $gateReason = $this->opportunityGate->rejection($enriched, $quoteHaystack, $profile);
                if ($gateReason !== null) {
                    $notActionable++;
                    $rejectedDetail[$gateReason] = ($rejectedDetail[$gateReason] ?? 0) + 1;

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
                        'author_role' => $enriched['author_role'] ?? null,
                        'opportunity_kind' => $enriched['opportunity_kind'] ?? null,
                        'query_family' => $item['family'],
                        'listening_mode' => $profile->mode,
                    ],
                ]);

                $seenHashes[$hash] = true;
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
                    'rejectedDetail' => $rejectedDetail,
                    'unlabeled' => $unlabeled,
                    'budget_exhausted' => $this->budgetExhausted,
                    'model_unavailable' => $modelUnavailable,
                    'freshnessWindowRequested' => $requestedWindow,
                    'freshnessWindowApplied' => $appliedWindow,
                    'listeningProfile' => $profile->toSummary(),
                    'queries' => $this->queryLog,
                    'feedback' => $feedback->summary(),
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
     * Plans the run's queries and searches them across sources until the call
     * budget or the survivor target is hit.
     *
     * Queries are searched query-major (every source for query 1, then query
     * 2, ...) so a capped run still samples every query family on every
     * source. The plan's start offset rotates between runs, so a scheduled
     * ICP works through its whole plan over successive scans instead of
     * re-running the same first few queries and finding only duplicates.
     *
     * @param  Collection<int, SignalTypeDefinition>  $definitions
     * @param  list<string>  $enabled
     * @param  array<string, mixed>  $context
     * @return Collection<int, array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string}>
     */
    private function collectHits(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        ListeningProfile $profile,
        array $enabled,
        string $tbs,
        array $context,
        Collection $definitions,
        int $windowDays,
    ): Collection {
        $general = $this->rotate($this->opportunityQueries->plan($profile), $icp->id);

        $typed = [];
        foreach ($definitions as $definition) {
            foreach ($this->signalQueryBuilder->buildQueriesForType($definition, $brief) as $query) {
                $typed[] = [
                    'query' => $query,
                    'native' => $query,
                    'family' => 'signal_type',
                    'only_sources' => null,
                    'signalTypeKey' => $definition->key,
                ];
            }
        }

        $queries = $this->mergeQueryLists($general, $typed);

        $byKey = [];
        foreach ($this->sources as $source) {
            $byKey[$source->key()] = $source;
        }

        $maxCalls = $this->budget('max_search_calls_per_run', self::DEFAULT_MAX_SEARCH_CALLS);
        $survivorTarget = $this->budget('survivor_target', self::DEFAULT_SURVIVOR_TARGET);

        $tagged = [];
        $seen = [];
        $survivors = 0;
        $calls = 0;
        $generalUsed = [];

        $absorb = function (array $hits, ?string $signalTypeKey, string $family) use (&$tagged, &$seen, &$survivors, $profile, $windowDays): void {
            foreach ($hits as $hit) {
                $hash = $this->hashFor($hit);
                if (array_key_exists($hash, $seen)) {
                    $index = $seen[$hash];
                    if ($tagged[$index]['signalTypeKey'] === null && $signalTypeKey !== null) {
                        $tagged[$index]['signalTypeKey'] = $signalTypeKey;
                    }

                    continue;
                }
                $seen[$hash] = count($tagged);
                $tagged[] = ['hit' => $hit, 'signalTypeKey' => $signalTypeKey, 'family' => $family];
                if ($this->survives($hit, $profile, $windowDays)) {
                    $survivors++;
                }
            }
        };

        $searchPhase = function (array $keys, bool $requireListed) use (
            &$calls,
            &$survivors,
            &$generalUsed,
            $absorb,
            $byKey,
            $brief,
            $organization,
            $enabled,
            $tbs,
            $context,
            $queries,
            $maxCalls,
            $survivorTarget,
        ): void {
            foreach ($queries as $planned) {
                foreach ($keys as $key) {
                    if ($calls >= $maxCalls || $survivors >= $survivorTarget) {
                        return;
                    }
                    if ($planned['only_sources'] !== null && ! in_array($key, $planned['only_sources'], true)) {
                        continue;
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
                    $query = in_array($key, self::FULL_TEXT_SOURCES, true) ? $planned['native'] : $planned['query'];
                    try {
                        $hits = $source->search($brief, $query, $organization->id, self::RESULTS_PER_QUERY, $tbs, $context)->all();
                    } catch (\Throwable $e) {
                        app(SocialSourceHealth::class)->recordAttempt($source->key(), 0, 0);
                        Log::warning('Social source search failed', [
                            'source' => $source->key(),
                            'error' => $e->getMessage(),
                        ]);
                        $hits = [];
                    }
                    $this->logQuery($key, $planned['family'], $query, count($hits));
                    if ($planned['family'] !== 'signal_type') {
                        $generalUsed[$planned['query']] = true;
                    }
                    $absorb($hits, $planned['signalTypeKey'] ?? null, $planned['family']);
                }
            }
        };

        $searchPhase(self::FULL_TEXT_SOURCES, false);
        $searchPhase(self::PRIMARY_SOURCES, true);
        if ($survivors < self::LOW_YIELD_FLOOR && $calls < $maxCalls) {
            $searchPhase(self::LOW_YIELD_SOURCES, true);
        }
        if ($survivors === 0 && $calls < $maxCalls) {
            $searchPhase(self::LAST_RESORT_SOURCES, true);
        }

        $this->advanceRotation($icp->id, count($generalUsed), count($general));

        return collect($tagged);
    }

    /**
     * General queries first, with a signal-type query slotted in after every
     * two general ones so typed packs still get searched under a tight budget.
     *
     * @param  list<array<string, mixed>>  $general
     * @param  list<array<string, mixed>>  $typed
     * @return list<array<string, mixed>>
     */
    private function mergeQueryLists(array $general, array $typed): array
    {
        if ($typed === []) {
            return $general;
        }
        if ($general === []) {
            return $typed;
        }

        $merged = [];
        $t = 0;
        foreach ($general as $i => $entry) {
            $merged[] = $entry;
            if ($i % 2 === 1 && isset($typed[$t])) {
                $merged[] = $typed[$t++];
            }
        }
        while (isset($typed[$t])) {
            $merged[] = $typed[$t++];
        }

        return $merged;
    }

    /**
     * @param  list<array<string, mixed>>  $planned
     * @return list<array<string, mixed>>
     */
    private function rotate(array $planned, int $icpId): array
    {
        $count = count($planned);
        if ($count < 2) {
            return $planned;
        }

        $offset = ((int) Cache::get($this->rotationKey($icpId), 0)) % $count;

        return array_merge(array_slice($planned, $offset), array_slice($planned, 0, $offset));
    }

    private function advanceRotation(int $icpId, int $used, int $planSize): void
    {
        if ($used <= 0 || $planSize < 2 || $used >= $planSize) {
            Cache::forget($this->rotationKey($icpId));

            return;
        }

        $current = (int) Cache::get($this->rotationKey($icpId), 0);
        Cache::put($this->rotationKey($icpId), ($current + $used) % $planSize, now()->addDays(self::ROTATION_TTL_DAYS));
    }

    private function rotationKey(int $icpId): string
    {
        return "social_listening:rotation:{$icpId}";
    }

    private function logQuery(string $source, string $family, string $query, int $hits): void
    {
        if (count($this->queryLog) >= 60) {
            return;
        }

        $this->queryLog[] = [
            'source' => $source,
            'family' => $family,
            'query' => mb_substr($query, 0, 300),
            'hits' => $hits,
        ];
    }

    private function budget(string $key, int $default): int
    {
        return max(1, (int) config("services.social_listening.{$key}", $default));
    }

    private function hashFor(RawSocialHit $hit): string
    {
        return md5(mb_strtolower($hit->postUrl ?? $hit->postText));
    }

    /**
     * @param  Collection<int, array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string}>  $tagged
     * @return array<string, true>
     */
    private function knownHashes(int $organizationId, int $icpId, Collection $tagged): array
    {
        $hashes = $tagged->map(fn (array $entry) => $this->hashFor($entry['hit']))->unique()->values()->all();
        if ($hashes === []) {
            return [];
        }

        $known = [];
        foreach (array_chunk($hashes, 500) as $chunk) {
            SocialSignal::query()
                ->where('organization_id', $organizationId)
                ->where('icp_profile_id', $icpId)
                ->whereIn('content_hash', $chunk)
                ->pluck('content_hash')
                ->each(function ($hash) use (&$known) {
                    $known[(string) $hash] = true;
                });
        }

        return $known;
    }

    /**
     * Reddit search hits usually arrive as a one-line snippet with no date.
     * Fetch the post JSON (concurrently) for those so the date gate and the
     * qualifier see the real post.
     *
     * @param  list<array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string}>  $candidates
     * @return list<array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string}>
     */
    private function hydrateReddit(array $candidates): array
    {
        $cap = $this->budget('max_reddit_hydrations_per_run', self::DEFAULT_HYDRATE_CAP);
        $targets = [];
        foreach ($candidates as $index => $entry) {
            $hit = $entry['hit'];
            if (count($targets) >= $cap) {
                break;
            }
            if (! $hit->fullText && preg_match('#reddit\.com#i', (string) $hit->postUrl)) {
                $targets[$index] = $hit;
            }
        }

        if ($targets === []) {
            return $candidates;
        }

        foreach ($this->redditHydrator->hydrateMany($targets) as $index => $hydrated) {
            $candidates[$index]['hit'] = $hydrated;
        }

        return $candidates;
    }

    private function survives(RawSocialHit $hit, ListeningProfile $profile, int $windowDays): bool
    {
        $postedAt = $hit->postedAt;
        if ($postedAt === null && $hit->postUrl) {
            $postedAt = app(LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
        }

        // Undated Reddit hits are still worth counting: hydration recovers
        // their date before the real grounding gate runs.
        $isHydratableReddit = $postedAt === null && ! $hit->fullText && preg_match('#reddit\.com/r/[^/]+/comments/#i', (string) $hit->postUrl);
        if (! $isHydratableReddit) {
            $gate = $this->groundingGate->admit($hit->postUrl, $postedAt, $windowDays, null, false);
            if (! $gate->admitted) {
                return false;
            }
        }

        return $this->prefilter->accepts($hit, $profile);
    }

    /**
     * Order candidates so the enrich cap keeps the most promising ones:
     * explicit asks and competitor complaints first, full text over
     * snippets, dated over undated, and posts that use the plan's own terms.
     *
     * @param  list<array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string, postedAt: mixed}>  $ready
     * @return list<array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string, postedAt: mixed}>
     */
    private function rankReady(array $ready, ListeningProfile $profile): array
    {
        $tokens = [];
        foreach ([...$profile->searchTerms(), ...$profile->competitors] as $term) {
            foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($term)) ?: [] as $word) {
                if (mb_strlen((string) $word) >= 4) {
                    $tokens[$word] = true;
                }
            }
        }
        $tokens = array_keys($tokens);

        $ranked = array_map(fn (array $entry) => [$this->readyRank($entry, $tokens, $profile), $entry], $ready);
        usort($ranked, static fn (array $a, array $b): int => $b[0] <=> $a[0]);

        return array_map(static fn (array $pair) => $pair[1], $ranked);
    }

    /**
     * @param  array{hit: RawSocialHit, signalTypeKey: ?string, family: ?string, postedAt: mixed}  $entry
     * @param  list<string>  $tokens
     */
    private function readyRank(array $entry, array $tokens, ListeningProfile $profile): int
    {
        $hit = $entry['hit'];
        $text = mb_strtolower($hit->postText.' '.$hit->title);
        $rank = $entry['postedAt'] !== null ? 3 : 0;
        $rank += $hit->fullText ? 2 : 0;
        $rank += $this->prefilter->hasCue($text, $profile) ? 5 : 0;
        $rank += match ($entry['family'] ?? null) {
            'competitor', 'ask' => 3,
            'community', 'evaluate', 'pain' => 2,
            default => 0,
        };
        if (preg_match('/[?？]/u', $text)) {
            $rank += 2;
        }
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
