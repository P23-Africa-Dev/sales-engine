<?php

namespace App\Services\Discovery;

use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\LeadSignal;
use App\Models\Organization;
use App\Models\User;
use App\Services\CompanyCache\CompanyCacheService;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Discovery\QueryIntentService;
use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\CompanyNameValidator;
use App\Services\Discovery\FactualListSynthesizer;
use App\Services\Extraction\ExtractionService;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use App\Services\Enrichment\ProfileUrlValidator;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use App\Services\Scoring\ScoringService;
use Illuminate\Support\Collection;

class DiscoveryOrchestrator
{
    public const MAX_LEAD_LIMIT = 150;

    public const QUALITY_STRICT = 'strict';

    public const QUALITY_BALANCED = 'balanced';

    public const QUALITY_VOLUME = 'volume';

    public const MAX_BACKFILL_PASSES = 2;

    /** Soft target for returning a first batch (seconds). */
    public const FIRST_BATCH_SOFT_SECONDS = 90;

    /** Stop discovering and complete with whatever we have (seconds). */
    public const HARD_DEADLINE_SECONDS = 150;

    private string $qualityThreshold = self::QUALITY_STRICT;

    private float $deadlineAt = 0.0;

    private float $startedAt = 0.0;

    private bool $deferContactEnrichment = true;

    /** @var array<string, Collection<int, RawDiscoveryHit>> */
    private array $registryHitCache = [];

    /** @var array{dropped_creatability: int, dropped_hard_gate: int, kept_advisory_profile: int} */
    private array $gateStats = [
        'dropped_creatability' => 0,
        'dropped_hard_gate' => 0,
        'kept_advisory_profile' => 0,
    ];

    /** @param  list<DiscoverySourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly CompanyCacheService $cache,
        private readonly ExtractionService $extraction,
        private readonly ScoringService $scoring,
        private readonly QueryIntentService $queryIntent,
        private readonly PersonNameValidator $personNameValidator,
        private readonly CompanyNameValidator $companyNameValidator,
        private readonly FactualListSynthesizer $factualListSynthesizer,
        private readonly LeadProfileEnrichmentService $enrichment,
        private readonly QueryVariationGenerator $queryVariationGenerator,
        private readonly ProfileUrlValidator $profileUrlValidator,
        private readonly LeadQueryNormalizer $leadQueryNormalizer,
        private readonly IcpFilterService $icpFilter = new IcpFilterService,
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    public function setQualityThreshold(string $threshold): self
    {
        if (in_array($threshold, [self::QUALITY_STRICT, self::QUALITY_BALANCED, self::QUALITY_VOLUME], true)) {
            $this->qualityThreshold = $threshold;
        }

        return $this;
    }

    /**
     * @param  list<string>  $excludeLeadNames  Names already shown (generate-more).
     * @param  string|null  $searchQueryOverride  When set (ICP Search Brief), Serper uses this while
     *                                            `$query` stays the user's ask for hasUserQuery / hard-gate mode.
     * @return array{run: DiscoveryRun, leads: list<array<string, mixed>>, companies: Collection}
     */
    public function run(
        Organization $organization,
        IcpProfile $icp,
        ?User $user = null,
        string $query = '',
        string $intent = 'generate_leads',
        ?int $chatSessionId = null,
        int $limit = 20,
        ?DiscoveryRun $existingRun = null,
        array $excludeLeadNames = [],
        bool $deferContactEnrichment = true,
        ?string $searchQueryOverride = null,
    ): array {
        $briefSeed = IcpBrief::fromIcpProfile($icp, $query);
        if ($searchQueryOverride !== null && trim($searchQueryOverride) !== '') {
            $briefSeed = $briefSeed->withSearchQueryOverride(trim($searchQueryOverride));
        }
        $storedQuery = $briefSeed->searchQuery();

        $run = $existingRun ?? DiscoveryRun::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user?->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $chatSessionId,
            'status' => 'running',
            'query' => $storedQuery,
            'intent' => $intent,
            'stages' => ['analyzing_brief'],
            'started_at' => now(),
        ]);

        if ($existingRun) {
            $run->update([
                'status' => 'running',
                'query' => $storedQuery,
                'intent' => $intent,
                'stages' => ['analyzing_brief'],
                'started_at' => now(),
            ]);
        }

        try {
            $this->startedAt = microtime(true);
            $this->deadlineAt = $this->startedAt + self::HARD_DEADLINE_SECONDS;
            $this->deferContactEnrichment = $deferContactEnrichment;
            $this->registryHitCache = [];
            $this->gateStats = [
                'dropped_creatability' => 0,
                'dropped_hard_gate' => 0,
                'kept_advisory_profile' => 0,
            ];
            $this->enrichment->setDeferContactWaterfall($deferContactEnrichment);

            $brief = $briefSeed;
            $hasUserQuery = $brief->hasUserQuery();
            $effectiveLimit = min(self::MAX_LEAD_LIMIT, max(1, $limit > 0 ? $limit : $brief->requestedLimit));
            $this->qualityThreshold = $this->resolveQualityThreshold($effectiveLimit);
            $ctx = new SearchContext($organization->id, $user?->id, $effectiveLimit, $intent);

            $this->updateProgress($run, 1, 0, 0);

            $this->appendStage($run, 'searching_sources');
            $this->enrichment->resetBudget();
            $this->profileUrlValidator->resetBudget();

            $leadsPayload = [];
            $companies = collect();
            $candidatesFound = 0;
            $allQueriesExecuted = [];
            $allSourcesHitCount = [];
            $fanOutUsed = false;
            $sourcesChecked = 0;
            $backfillPasses = 0;
            $seenLeadNames = [];
            foreach ($excludeLeadNames as $excluded) {
                $key = mb_strtolower(trim((string) $excluded));
                if ($key !== '') {
                    $seenLeadNames[$key] = true;
                }
            }

            $minUsableBatch = max(1, (int) ceil($effectiveLimit / 4));
            $softCompletedEarly = false;

            $targetPasses = [];
            if ($brief->isBothSearch() && in_array($intent, ['generate_leads', 'generate_more_leads'], true)) {
                // People first so LinkedIn contacts land before Hunter fills company slots.
                $peopleLimit = max(1, (int) ceil($effectiveLimit * 0.5));
                $companyLimit = max(0, $effectiveLimit - $peopleLimit);
                if ($companyLimit < 1 && $effectiveLimit >= 2) {
                    $companyLimit = 1;
                    $peopleLimit = $effectiveLimit - 1;
                }
                $targetPasses = [
                    [
                        'stage' => 'people_pass',
                        'brief' => $brief->withTarget(QueryIntentService::TARGET_PEOPLE),
                        'limit' => $peopleLimit,
                    ],
                ];
                if ($companyLimit >= 1) {
                    $targetPasses[] = [
                        'stage' => 'company_pass',
                        'brief' => $brief->withTarget(QueryIntentService::TARGET_COMPANIES),
                        'limit' => $companyLimit,
                    ];
                }
            } else {
                $targetPasses = [
                    [
                        'stage' => null,
                        'brief' => $brief,
                        'limit' => $effectiveLimit,
                    ],
                ];
            }

            $peoplePassCompleted = ! $brief->isBothSearch();

            foreach ($targetPasses as $targetPass) {
                if ($this->pastDeadline() || count($leadsPayload) >= $effectiveLimit) {
                    break;
                }

                /** @var IcpBrief $passBrief */
                $passBrief = $targetPass['brief'];
                $passLimit = (int) $targetPass['limit'];
                $isAuthoritativePass = $passBrief->isAuthoritativePeopleQuery();
                $isPeoplePass = ($targetPass['stage'] ?? null) === 'people_pass'
                    || ($passBrief->isPeopleSearch() && ! $brief->isBothSearch());

                if (is_string($targetPass['stage'] ?? null) && $targetPass['stage'] !== '') {
                    $this->appendStage($run, (string) $targetPass['stage']);
                }

                $passStartCount = count($leadsPayload);
                $multiTarget = count($targetPasses) > 1;
                $passMinUsable = $multiTarget
                    ? max(1, (int) ceil($passLimit / 4))
                    : $minUsableBatch;

                for ($pass = 0; $pass <= self::MAX_BACKFILL_PASSES; $pass++) {
                    if ($this->pastDeadline()) {
                        $softCompletedEarly = true;
                        break;
                    }

                    $passYield = count($leadsPayload) - $passStartCount;
                    $remaining = min(
                        $passLimit - $passYield,
                        $effectiveLimit - count($leadsPayload),
                    );
                    if ($remaining <= 0) {
                        break;
                    }

                    $isBackfill = $pass > 0;
                    if ($isBackfill) {
                        // Keep backfilling while under the requested limit until the hard deadline.
                        // Soft deadline alone must not stop when yield is still below what the user asked for.
                        if ($passYield >= $passLimit) {
                            break;
                        }

                        $this->qualityThreshold = self::QUALITY_VOLUME;
                        $this->appendStage($run, 'backfill_pass_' . $pass);
                        $backfillPasses++;

                        $backfillQueries = $this->queryVariationGenerator->generateBackfill(
                            $passBrief,
                            $passLimit,
                            $allQueriesExecuted,
                        );

                        if ($backfillQueries === []) {
                            break;
                        }

                        [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits(
                            $passBrief,
                            $ctx,
                            $passLimit,
                            $backfillQueries,
                        );
                    } else {
                        $firstPassQueries = null;
                        // LinkedIn-first shortcut only for small people batches (chat default),
                        // not company searches or high-capacity fan-out / backfill paths.
                        if (
                            in_array($intent, ['generate_leads', 'generate_more_leads'], true)
                            && $passBrief->isPeopleSearch()
                            && ! $passBrief->isAuthoritativePeopleQuery()
                            && $passLimit <= QueryIntentService::DEFAULT_LEAD_LIMIT
                        ) {
                            $firstPassQueries = $this->leadQueryNormalizer->firstBatchPeopleQueries($icp);
                        }

                        [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits(
                            $passBrief,
                            $ctx,
                            $passLimit,
                            $firstPassQueries !== [] ? $firstPassQueries : null,
                        );
                    }

                    $allQueriesExecuted = array_values(array_unique(array_merge(
                        $allQueriesExecuted,
                        $fanOutMeta['queries_executed'] ?? [],
                    )));
                    foreach ($fanOutMeta['sources_hit_count'] ?? [] as $key => $count) {
                        $allSourcesHitCount[$key] = ($allSourcesHitCount[$key] ?? 0) + (int) $count;
                    }
                    $fanOutUsed = $fanOutUsed || (bool) ($fanOutMeta['fan_out_strategy_used'] ?? false);

                    $this->updateProgress($run, 2, $sourcesChecked, $candidatesFound);
                    if (! $isBackfill) {
                        $this->appendStage($run, 'extracting');
                    }

                    if ($this->pastDeadline()) {
                        $softCompletedEarly = true;
                        break;
                    }

                    if ($isAuthoritativePass && ! $isBackfill) {
                        [$passLeads, $passCompanies, $passFound] = $this->processAuthoritativePeopleQuery(
                            $organization,
                            $icp,
                            $passBrief,
                            $hits,
                            $intent,
                            $hasUserQuery,
                            $remaining,
                            $sourcesChecked,
                            $run,
                            $seenLeadNames,
                        );
                    } else {
                        [$passLeads, $passCompanies, $passFound] = $this->processStandardQuery(
                            $organization,
                            $icp,
                            $passBrief,
                            $hits,
                            $intent,
                            $hasUserQuery,
                            $remaining,
                            $sourcesChecked,
                            $run,
                            $seenLeadNames,
                        );
                    }

                    foreach ($passLeads as $lead) {
                        $nameKey = mb_strtolower(trim((string) ($lead['name'] ?? '')));
                        if ($nameKey !== '') {
                            $seenLeadNames[$nameKey] = true;
                        }
                        $leadsPayload[] = $lead;
                    }
                    $companies = $companies->merge($passCompanies);
                    $candidatesFound += $passFound;

                    $passYield = count($leadsPayload) - $passStartCount;
                    if ($passYield >= $passLimit || count($leadsPayload) >= $effectiveLimit) {
                        break;
                    }

                    // Soft-complete a pass only with usable yield past soft deadline.
                    // Never abort while under half of the requested quota (keep backfilling).
                    // Never abort the whole both-mode run before people_pass has finished at least one cycle.
                    if ($this->shouldSoftCompletePass($passYield, $passMinUsable, count($leadsPayload), $effectiveLimit)) {
                        if ($brief->isBothSearch() && ! $peoplePassCompleted && ! $isPeoplePass) {
                            // Still need to give people_pass a turn — skip further company backfill only.
                            break;
                        }
                        $softCompletedEarly = true;
                        break;
                    }
                }

                if ($isPeoplePass) {
                    $peoplePassCompleted = true;
                }
            }

            // People searches that still yield nothing → company rescue (skip if out of time).
            if (
                $leadsPayload === []
                && $brief->isPeopleSearch()
                && in_array($intent, ['generate_leads', 'generate_more_leads'], true)
                && ! $this->pastSoftDeadline()
            ) {
                $this->appendStage($run, 'company_rescue_pass');
                $this->qualityThreshold = self::QUALITY_VOLUME;
                $companyBrief = $brief->withTarget(QueryIntentService::TARGET_COMPANIES);
                $rescueQueries = $this->queryVariationGenerator->generateBackfill(
                    $companyBrief,
                    $effectiveLimit,
                    $allQueriesExecuted,
                );
                if ($rescueQueries === []) {
                    $rescueQueries = $this->queryVariationGenerator->generate($companyBrief, $effectiveLimit);
                }

                if ($rescueQueries !== []) {
                    [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits(
                        $companyBrief,
                        $ctx,
                        $effectiveLimit,
                        $rescueQueries,
                    );
                    $allQueriesExecuted = array_values(array_unique(array_merge(
                        $allQueriesExecuted,
                        $fanOutMeta['queries_executed'] ?? [],
                    )));
                    foreach ($fanOutMeta['sources_hit_count'] ?? [] as $key => $count) {
                        $allSourcesHitCount[$key] = ($allSourcesHitCount[$key] ?? 0) + (int) $count;
                    }
                    $fanOutUsed = true;

                    [$passLeads, $passCompanies, $passFound] = $this->processStandardQuery(
                        $organization,
                        $icp,
                        $companyBrief,
                        $hits,
                        $intent,
                        $hasUserQuery,
                        $effectiveLimit,
                        $sourcesChecked,
                        $run,
                        $seenLeadNames,
                    );

                    foreach ($passLeads as $lead) {
                        $nameKey = mb_strtolower(trim((string) ($lead['name'] ?? '')));
                        if ($nameKey !== '') {
                            $seenLeadNames[$nameKey] = true;
                        }
                        $leadsPayload[] = $lead;
                    }
                    $companies = $companies->merge($passCompanies);
                    $candidatesFound += $passFound;
                }
            }

            // Company searches that still yield nothing → people rescue (symmetric, empty-only).
            if (
                $leadsPayload === []
                && $brief->isCompanySearch()
                && in_array($intent, ['generate_leads', 'generate_more_leads'], true)
                && ! $this->pastSoftDeadline()
            ) {
                $this->appendStage($run, 'people_rescue_pass');
                $this->qualityThreshold = self::QUALITY_VOLUME;
                $peopleBrief = $brief->withTarget(QueryIntentService::TARGET_PEOPLE);
                $rescueQueries = $this->queryVariationGenerator->generateBackfill(
                    $peopleBrief,
                    $effectiveLimit,
                    $allQueriesExecuted,
                );
                if ($rescueQueries === []) {
                    $rescueQueries = $this->queryVariationGenerator->generate($peopleBrief, $effectiveLimit);
                }

                if ($rescueQueries !== []) {
                    [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits(
                        $peopleBrief,
                        $ctx,
                        $effectiveLimit,
                        $rescueQueries,
                    );
                    $allQueriesExecuted = array_values(array_unique(array_merge(
                        $allQueriesExecuted,
                        $fanOutMeta['queries_executed'] ?? [],
                    )));
                    foreach ($fanOutMeta['sources_hit_count'] ?? [] as $key => $count) {
                        $allSourcesHitCount[$key] = ($allSourcesHitCount[$key] ?? 0) + (int) $count;
                    }
                    $fanOutUsed = true;

                    [$passLeads, $passCompanies, $passFound] = $this->processStandardQuery(
                        $organization,
                        $icp,
                        $peopleBrief,
                        $hits,
                        $intent,
                        $hasUserQuery,
                        $effectiveLimit,
                        $sourcesChecked,
                        $run,
                        $seenLeadNames,
                    );

                    foreach ($passLeads as $lead) {
                        $nameKey = mb_strtolower(trim((string) ($lead['name'] ?? '')));
                        if ($nameKey !== '') {
                            $seenLeadNames[$nameKey] = true;
                        }
                        $leadsPayload[] = $lead;
                    }
                    $companies = $companies->merge($passCompanies);
                    $candidatesFound += $passFound;
                }
            }

            $leadsPayload = array_slice($this->sortLeadsPayload($leadsPayload), 0, $effectiveLimit);

            $this->appendStage($run, 'compiling_results');
            $this->updateProgress($run, 4, $sourcesChecked, $candidatesFound);

            $icp->lead_count = Lead::query()
                ->where('organization_id', $organization->id)
                ->where('icp_profile_id', $icp->id)
                ->count();
            $icp->save();

            $run->update([
                'status' => 'completed',
                'error' => null,
                'result_summary' => array_merge(
                    is_array($run->result_summary) ? $run->result_summary : [],
                    [
                        'lead_count' => count($leadsPayload),
                        'sources_enabled' => collect($this->sources)->filter->isEnabled()->map->key()->values()->all(),
                        'queries_executed' => $allQueriesExecuted,
                        'sources_hit_count' => $allSourcesHitCount,
                        'candidates_extracted' => array_sum($allSourcesHitCount),
                        'candidates_passed_gates' => $candidatesFound,
                        'dropped_creatability' => $this->gateStats['dropped_creatability'],
                        'dropped_hard_gate' => $this->gateStats['dropped_hard_gate'],
                        'kept_advisory_profile' => $this->gateStats['kept_advisory_profile'],
                        'gate_stats' => $this->gateStats,
                        'serper_geo' => $this->discoveryGeo->shouldApplyRetrievalGeo($brief)
                            ? $this->discoveryGeo->serperParams($brief)
                            : [],
                        'fan_out_strategy_used' => $fanOutUsed,
                        'quality_threshold' => $this->qualityThreshold,
                        'backfill_passes' => $backfillPasses,
                        'soft_completed_early' => $softCompletedEarly,
                        'elapsed_seconds' => round(microtime(true) - $this->startedAt, 1),
                        'contact_enrichment_deferred' => $this->deferContactEnrichment,
                    ]
                ),
                'finished_at' => now(),
            ]);

            return ['run' => $run->fresh(), 'leads' => $leadsPayload, 'companies' => $companies];
        } catch (\Throwable $e) {
            $run->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);
            throw $e;
        } finally {
            $this->enrichment->setDeferContactWaterfall(false);
        }
    }

    private function pastDeadline(): bool
    {
        return $this->deadlineAt > 0 && microtime(true) >= $this->deadlineAt;
    }

    private function pastSoftDeadline(): bool
    {
        return $this->startedAt > 0 && (microtime(true) - $this->startedAt) >= self::FIRST_BATCH_SOFT_SECONDS;
    }

    private function remainingSeconds(): float
    {
        if ($this->deadlineAt <= 0) {
            return 999;
        }

        return max(0, $this->deadlineAt - microtime(true));
    }

    /**
     * Soft-complete only when we already have at least half the requested quota.
     * Under-quota runs keep backfilling until the hard deadline.
     */
    private function shouldSoftCompletePass(
        int $passYield,
        int $passMinUsable,
        int $leadCount,
        int $effectiveLimit,
    ): bool {
        $halfQuota = (int) ceil($effectiveLimit / 2);

        return $passYield >= $passMinUsable
            && $leadCount >= $halfQuota
            && $this->pastSoftDeadline()
            && $this->remainingSeconds() < 25;
    }

    private function shouldUseFanOut(int $limit): bool
    {
        return $limit >= QueryVariationGenerator::FAN_OUT_THRESHOLD;
    }

    private function resolveQualityThreshold(int $effectiveLimit): string
    {
        if ($effectiveLimit >= 50) {
            return self::QUALITY_VOLUME;
        }

        if ($effectiveLimit >= 12) {
            return self::QUALITY_BALANCED;
        }

        return self::QUALITY_STRICT;
    }

    /**
     * @param  list<string>|null  $overrideQueries  When set, run these queries instead of generating a fresh fan-out set.
     * @return array{0: Collection<int, RawDiscoveryHit>, 1: int, 2: array{queries_executed: list<string>, sources_hit_count: array<string, int>, fan_out_strategy_used: bool, candidates_extracted?: int}}
     */
    private function collectHits(
        IcpBrief $brief,
        SearchContext $ctx,
        int $effectiveLimit,
        ?array $overrideQueries = null,
    ): array {
        $hits = collect();
        $sourcesHitCount = [];
        $queriesExecuted = [];
        $fanOut = $overrideQueries !== null || $this->shouldUseFanOut($effectiveLimit);
        $enabledSources = array_values(array_filter(
            $this->sources,
            fn(DiscoverySourceInterface $source): bool => $source->isEnabled()
        ));
        $sourcesChecked = count($enabledSources);

        if ($overrideQueries !== null) {
            $variations = $overrideQueries;
        } elseif ($fanOut) {
            $variations = $this->queryVariationGenerator->generate($brief, $effectiveLimit);
        } else {
            $q = $this->discoveryGeo->appendTerritoryClause($brief, $brief->searchQuery());
            $variations = [$q];
        }

        $queriesExecuted = array_values(array_filter(array_map('strval', $variations)));

        $serper = null;
        $otherSources = [];
        foreach ($enabledSources as $source) {
            if ($source instanceof \App\Services\Discovery\Adapters\SerperDiscoveryAdapter) {
                $serper = $source;
            } else {
                $otherSources[] = $source;
            }
        }

        if ($serper !== null && $queriesExecuted !== []) {
            $batch = $serper->searchMany($queriesExecuted, $brief, $ctx);
            $sourcesHitCount['serper'] = ($sourcesHitCount['serper'] ?? 0) + $batch->count();
            $hits = $hits->merge($batch);
        }

        // Freemium quota guard: Fylings/Hunter/Mono run once on the primary query,
        // not once per Serper fan-out variation (would burn monthly caps quickly).
        $primaryQuery = $brief->searchQuery();
        if ($primaryQuery === '' && $queriesExecuted !== []) {
            $primaryQuery = (string) $queriesExecuted[0];
        }
        $primaryBrief = $primaryQuery !== ''
            ? $brief->withSearchQueryOverride($primaryQuery)
            : $brief;

        foreach ($otherSources as $source) {
            if ($this->pastDeadline()) {
                break;
            }

            // Hunter/company registries only on company (or both company-pass) searches.
            if ($source->key() === 'hunter' && $brief->isPeopleSearch()) {
                continue;
            }

            $cacheKey = $source->key() . '|' . mb_strtolower(trim($primaryBrief->searchQuery())) . '|' . $effectiveLimit;
            if (isset($this->registryHitCache[$cacheKey])) {
                $batch = $this->registryHitCache[$cacheKey];
            } else {
                $passCtx = new SearchContext(
                    $ctx->organizationId,
                    $ctx->userId,
                    max(1, $effectiveLimit),
                    $ctx->intent,
                );
                $batch = $source->search($primaryBrief, $passCtx);
                // Cap registry volume to the current pass limit so Hunter cannot oversupply.
                if ($batch->count() > $effectiveLimit) {
                    $batch = $batch->take(max(1, $effectiveLimit))->values();
                }
                $this->registryHitCache[$cacheKey] = $batch;
            }

            $key = $source->key();
            $sourcesHitCount[$key] = ($sourcesHitCount[$key] ?? 0) + $batch->count();
            $hits = $hits->merge($batch);
        }

        $hits = $this->preferLinkedInHits($this->dedupeHits($hits), $brief);

        return [
            $hits,
            max(1, $sourcesChecked),
            [
                'queries_executed' => $queriesExecuted,
                'sources_hit_count' => $sourcesHitCount,
                'fan_out_strategy_used' => $fanOut,
                'candidates_extracted' => $hits->count(),
            ],
        ];
    }

    /**
     * @param  Collection<int, RawDiscoveryHit>  $hits
     * @return Collection<int, RawDiscoveryHit>
     */
    private function dedupeHits(Collection $hits): Collection
    {
        $seen = [];

        return $hits->filter(function (RawDiscoveryHit $hit) use (&$seen): bool {
            $nameKey = mb_strtolower(trim($hit->name));
            $urlKey = mb_strtolower(trim((string) ($hit->url ?? '')));
            $dedupeKey = $urlKey !== '' ? $nameKey . '|' . $urlKey : $nameKey;

            if ($dedupeKey === '' || isset($seen[$dedupeKey])) {
                return false;
            }

            $seen[$dedupeKey] = true;

            return true;
        })->values();
    }

    /**
     * Prefer LinkedIn profile/company hits over bare registry domains.
     *
     * @param  Collection<int, RawDiscoveryHit>  $hits
     * @return Collection<int, RawDiscoveryHit>
     */
    private function preferLinkedInHits(Collection $hits, IcpBrief $brief): Collection
    {
        return $hits->sortByDesc(function (RawDiscoveryHit $hit) use ($brief): int {
            $url = mb_strtolower((string) ($hit->url ?? ''));
            $provider = mb_strtolower((string) ($hit->provider ?? ''));
            if ($brief->isPeopleSearch() && str_contains($url, 'linkedin.com/in/')) {
                return 100;
            }
            if ($brief->isCompanySearch() && str_contains($url, 'linkedin.com/company/')) {
                return 90;
            }
            if (str_contains($url, 'linkedin.com/')) {
                return 50;
            }
            if ($provider === 'hunter') {
                return 5;
            }

            return 20;
        })->values();
    }

    public function enabledSources(): array
    {
        return collect($this->sources)
            ->map(fn(DiscoverySourceInterface $s) => [
                'key' => $s->key(),
                'enabled' => $s->isEnabled(),
            ])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, RawDiscoveryHit>  $hits
     * @param  array<string, true>  $seenLeadNames
     * @return array{0: list<array<string, mixed>>, 1: Collection, 2: int}
     */
    private function processAuthoritativePeopleQuery(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        Collection $hits,
        string $intent,
        bool $hasUserQuery,
        int $effectiveLimit,
        int $sourcesChecked,
        DiscoveryRun $run,
        array $seenLeadNames = [],
    ): array {
        $candidates = [];
        $seenNames = $seenLeadNames;

        /** @var RawDiscoveryHit $hit */
        foreach ($hits->unique(fn(RawDiscoveryHit $h) => mb_strtolower($h->name . ($h->url ?? ''))) as $hit) {
            $extractions = $this->extraction->extractMany($hit, $brief, $organization);

            foreach ($extractions as $extracted) {
                $displayName = trim((string) ($extracted['person_name'] ?? $extracted['name'] ?? ''));
                $nameKey = mb_strtolower($displayName);

                if ($displayName === '' || mb_strtolower($displayName) === mb_strtolower($brief->name)) {
                    continue;
                }

                if (isset($seenNames[$nameKey])) {
                    continue;
                }

                if (! $this->personNameValidator->isValidPersonName($displayName, $extracted)) {
                    continue;
                }

                $seenNames[$nameKey] = true;
                $candidates[] = ['hit' => $hit, 'extracted' => $extracted];
            }
        }

        $candidates = $this->factualListSynthesizer->synthesize($organization, $brief, $candidates, $effectiveLimit);

        return $this->finalizeCandidates(
            $organization,
            $icp,
            $brief,
            $candidates,
            $intent,
            $hasUserQuery,
            $effectiveLimit,
            $sourcesChecked,
            $run,
            true,
        );
    }

    /**
     * @param  Collection<int, RawDiscoveryHit>  $hits
     * @param  array<string, true>  $seenLeadNames
     * @return array{0: list<array<string, mixed>>, 1: Collection, 2: int}
     */
    private function processStandardQuery(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        Collection $hits,
        string $intent,
        bool $hasUserQuery,
        int $effectiveLimit,
        int $sourcesChecked,
        DiscoveryRun $run,
        array $seenLeadNames = [],
    ): array {
        $candidates = [];
        $seenNames = $seenLeadNames;
        $gatherCap = max($effectiveLimit, (int) ceil($effectiveLimit * 1.5));

        $orderedHits = $hits
            ->unique(fn(RawDiscoveryHit $h) => mb_strtolower($h->name . '|' . (string) $h->url))
            ->sortByDesc(function (RawDiscoveryHit $h) use ($brief): int {
                $url = mb_strtolower((string) $h->url);
                $provider = mb_strtolower((string) ($h->provider ?? ''));
                if ($brief->isPeopleSearch() && str_contains($url, 'linkedin.com/in/')) {
                    return 100;
                }
                if ($brief->isCompanySearch() && str_contains($url, 'linkedin.com/company/')) {
                    return 100;
                }
                if (str_contains($url, 'linkedin.com/')) {
                    return 40;
                }
                // Prefer Serper/web hits over bare Hunter domains when filling company quota.
                if ($brief->isCompanySearch() && $provider === 'hunter') {
                    return -10;
                }

                return 0;
            })
            ->values();

        /** @var RawDiscoveryHit $hit */
        foreach ($orderedHits as $hit) {
            if (count($candidates) >= $gatherCap || $this->pastDeadline() || $this->remainingSeconds() < 20) {
                break;
            }

            // Gate junk titles before expensive GLM extract/score.
            if (
                $this->queryIntent->looksLikeContentOrGenericPhrase($hit->name)
                && ! str_contains(mb_strtolower((string) $hit->url), 'linkedin.com/in/')
            ) {
                continue;
            }

            if ($brief->isPeopleSearch()) {
                $normalizedHit = $this->personNameValidator->normalizePersonName($hit->name);
                $probeName = $normalizedHit !== '' ? $normalizedHit : $hit->name;
                $isLinkedInProfile = str_contains(mb_strtolower((string) $hit->url), 'linkedin.com/in/');
                if (
                    ! $isLinkedInProfile
                    && ! $this->personNameValidator->isValidPersonName($probeName, [
                        'linkedin_url' => $hit->url,
                        'title' => $hit->snippet,
                        'company' => $hit->website,
                    ])
                    && ! $this->companyNameValidator->isValidCompanyName($hit->name, [])
                ) {
                    continue;
                }
            } elseif (! $this->companyNameValidator->isValidCompanyName($hit->name, [
                'website' => $hit->website,
                'url' => $hit->url,
            ])) {
                continue;
            }

            $extractions = $this->extraction->extractMany($hit, $brief, $organization);

            foreach ($extractions as $extracted) {
                $displayName = trim((string) ($extracted['person_name'] ?? $extracted['name'] ?? $hit->name));
                $nameKey = mb_strtolower($displayName);

                if ($displayName === '' || mb_strtolower($displayName) === mb_strtolower($brief->name)) {
                    continue;
                }

                if (isset($seenNames[$nameKey])) {
                    continue;
                }

                $extracted = $this->attachHitProfileUrls($extracted, $hit);

                if (! $this->passesCreatabilityGate(
                    $brief,
                    $displayName,
                    $extracted,
                    (bool) ($extracted['from_listicle'] ?? false),
                )) {
                    continue;
                }

                $seenNames[$nameKey] = true;
                $candidates[] = ['hit' => $hit, 'extracted' => $extracted];
            }
        }

        return $this->finalizeCandidates(
            $organization,
            $icp,
            $brief,
            $candidates,
            $intent,
            $hasUserQuery,
            $effectiveLimit,
            $sourcesChecked,
            $run,
            false,
        );
    }

    /**
     * @param  list<array{hit: RawDiscoveryHit, extracted: array<string, mixed>}>  $candidates
     * @return array{0: list<array<string, mixed>>, 1: Collection, 2: int}
     */
    private function finalizeCandidates(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        array $candidates,
        string $intent,
        bool $hasUserQuery,
        int $effectiveLimit,
        int $sourcesChecked,
        DiscoveryRun $run,
        bool $factualQuery,
    ): array {
        $leadsPayload = [];
        $secondaryPayload = [];
        $companies = collect();
        $candidatesFound = 0;
        $scoredCandidates = [];

        foreach ($candidates as $candidate) {
            if ($this->pastDeadline()) {
                break;
            }

            $hit = $candidate['hit'];
            $extracted = $candidate['extracted'];
            $displayName = trim((string) ($extracted['person_name'] ?? $extracted['name'] ?? $hit->name));
            if ($brief->isPeopleSearch()) {
                $normalized = $this->personNameValidator->normalizePersonName($displayName);
                if ($normalized !== '') {
                    $displayName = $normalized;
                    $extracted['person_name'] = $normalized;
                }
            }
            $fromListicle = (bool) ($extracted['from_listicle'] ?? false);

            $scorePayload = array_merge($extracted, [
                'name' => $displayName,
                'source' => $hit->source,
                'provider' => $hit->provider,
                'authoritative_source' => $this->isAuthoritativeUrl($hit->url),
            ]);

            // First-batch / near-deadline: heuristic scoring only (skip 60s GLM).
            $scores = ($this->deferContactEnrichment || $this->pastSoftDeadline() || $this->remainingSeconds() < 45)
                ? $this->scoring->heuristicScore($scorePayload, $brief)
                : $this->scoring->score($scorePayload, $brief, $organization);

            $scores = $this->applyScorePenalties($scores, $displayName, $brief, $extracted, $fromListicle);

            $scoredCandidates[] = compact('hit', 'extracted', 'displayName', 'fromListicle', 'scores');
        }

        usort($scoredCandidates, function (array $a, array $b): int {
            return ($b['scores']['priority_score'] ?? 0) <=> ($a['scores']['priority_score'] ?? 0);
        });

        foreach ($scoredCandidates as $candidate) {
            if (count($leadsPayload) + count($secondaryPayload) >= $effectiveLimit || $this->pastDeadline()) {
                break;
            }

            $scores = $candidate['scores'];
            $displayName = $candidate['displayName'];
            $extracted = $this->attachHitProfileUrls($candidate['extracted'], $candidate['hit']);
            $hit = $candidate['hit'];
            $fromListicle = $candidate['fromListicle'];

            if (! $this->passesCreatabilityGate($brief, $displayName, $extracted, $fromListicle)) {
                $this->gateStats['dropped_creatability']++;
                continue;
            }

            $icpRecommended = $scores['icp_fit_score'] >= $brief->minMatchScore;
            $queryMatch = $this->resolveQueryMatch(
                $hasUserQuery,
                $factualQuery,
                $fromListicle,
                $displayName,
                $extracted,
                $scores,
            );

            $gateResult = $this->icpHardGateResult($brief, $extracted);
            $territoryPassed = (bool) ($gateResult->reasons['territory'] ?? true);
            $enforceTerritory = $brief->territories !== []
                && ! $brief->isAuthoritativePeopleQuery()
                && ! $this->discoveryGeo->userNamedDifferentCountry($brief);

            if ($enforceTerritory && ! $territoryPassed) {
                $this->gateStats['dropped_hard_gate']++;
                continue;
            }

            // ICP-brief mode: hard-gate remaining firmographics. Trusted LinkedIn URLs
            // may stay as advisory only when territory passed (or was unconstrained).
            if (! $hasUserQuery && ! $gateResult->passed) {
                $isHunter = mb_strtolower((string) ($hit->provider ?? '')) === 'hunter';
                $industryOnlyFail = $territoryPassed && ($gateResult->reasons['industry'] ?? true) === false;
                if (! $isHunter && $industryOnlyFail && $this->hasTrustedEntityProfileUrl($brief, $extracted, $hit)) {
                    $icpRecommended = false;
                    $extracted['low_confidence'] = true;
                    $this->gateStats['kept_advisory_profile']++;
                } else {
                    $this->gateStats['dropped_hard_gate']++;
                    continue;
                }
            }

            // ICP-driven runs: when industries are set, refuse unverified firmographics
            // unless the candidate has a trusted direct profile URL. Territory misses
            // already dropped above — do not keep missing-geo LinkedIn hits.
            if (
                ! $hasUserQuery
                && ($brief->industries !== [] || $brief->territories !== [])
            ) {
                $fit = $this->scoring->assessFirmographicFit(
                    array_merge($extracted, [
                        'industry' => $extracted['industry'] ?? $extracted['sector'] ?? $hit->sector,
                        'sector' => $extracted['sector'] ?? $hit->sector,
                        'location' => $extracted['location'] ?? $hit->location,
                    ]),
                    $brief,
                );
                if ($fit['unknown'] && $enforceTerritory) {
                    $this->gateStats['dropped_hard_gate']++;
                    continue;
                }
                if ($fit['unknown'] && ! $this->hasTrustedEntityProfileUrl($brief, $extracted, $hit)) {
                    continue;
                }
            }

            // Hunter Discover often returns famous conglomerates with weak niche fit.
            // When the ICP constrains industries/territories, require firmographic evidence —
            // missing data must not auto-fill the company quota.
            if (
                $brief->isCompanySearch()
                && mb_strtolower((string) ($hit->provider ?? '')) === 'hunter'
                && ($brief->industries !== [] || $brief->territories !== [])
            ) {
                $hunterExtracted = array_merge($extracted, [
                    'industry' => $extracted['industry'] ?? $extracted['sector'] ?? $hit->sector,
                    'sector' => $extracted['sector'] ?? $hit->sector,
                    'location' => $extracted['location'] ?? $hit->location,
                ]);
                $hasFirmographics = filled($hunterExtracted['industry'] ?? null)
                    || filled($hunterExtracted['sector'] ?? null)
                    || filled($hunterExtracted['location'] ?? null);
                if (! $hasFirmographics || ! $this->passesIcpHardGate($brief, $hunterExtracted)) {
                    continue;
                }
            }

            // Below-threshold leads go into a secondary pool only in query mode.
            // ICP-driven runs hard-drop them (new_plan.md Stage 1).
            $minPriority = $this->effectiveMinMatchScore($brief);
            $isSecondary = $intent === 'generate_leads'
                && $hasUserQuery
                && $scores['priority_score'] < $minPriority;

            if ($brief->isPeopleSearch()) {
                $enrichedProfile = $this->enrichment->enrich(
                    $organization,
                    $icp,
                    $displayName,
                    $brief->query,
                    $extracted,
                );
                $extracted = $enrichedProfile->mergeIntoExtraction($extracted);
            } elseif (
                ! $this->deferContactEnrichment
                && ! $this->pastSoftDeadline()
                && $this->remainingSeconds() >= 45
            ) {
                // Defer company DM enrichment on first-batch / freemium runs so wall-clock
                // is spent creating more leads instead of enriching a thin set.
                $extracted = $this->enrichment->enrichCompanyDecisionMaker(
                    $organization,
                    $icp,
                    $displayName,
                    $brief,
                    $extracted,
                );
            }

            // Prefer a real person name on the card only for people searches.
            // Company/account leads keep the company as Lead.name; DM stays in meta.
            if ($brief->isPeopleSearch()) {
                $contactPerson = trim((string) ($extracted['contact_person'] ?? $extracted['person_name'] ?? ''));
                if (
                    $contactPerson !== ''
                    && $contactPerson !== $displayName
                    && $this->personNameValidator->isValidPersonName($contactPerson, $extracted)
                ) {
                    if (trim((string) ($extracted['company'] ?? '')) === '') {
                        $extracted['company'] = $displayName;
                    }
                    $displayName = $contactPerson;
                }
            }

            $leadPayload = $this->createLeadFromExtraction(
                $organization,
                $icp,
                $brief,
                $hit,
                $extracted,
                $displayName,
                $scores,
                $icpRecommended,
                $queryMatch,
            );

            $companies->push($leadPayload['company']);
            if ($isSecondary) {
                $secondaryPayload[] = $leadPayload['payload'];
            } else {
                $leadsPayload[] = $leadPayload['payload'];
            }
            $candidatesFound++;
            $this->updateProgress($run, 3, $sourcesChecked, $candidatesFound);
        }

        // Qualifying / primary leads first, then below-threshold secondary pool.
        $combined = array_merge($leadsPayload, $secondaryPayload);

        return [$combined, $companies, $candidatesFound];
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function passesIcpHardGate(IcpBrief $brief, array $extracted): bool
    {
        return $this->icpHardGateResult($brief, $extracted)->passed;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function icpHardGateResult(IcpBrief $brief, array $extracted): \App\Services\IcpFiltering\DTO\IcpFilterResult
    {
        $industry = trim((string) ($extracted['industry'] ?? '')) ?: null;
        $territory = trim((string) ($extracted['location'] ?? $extracted['territory'] ?? $extracted['city'] ?? '')) ?: null;
        $companySize = trim((string) ($extracted['company_size'] ?? $extracted['employee_count'] ?? '')) ?: null;
        $revenue = trim((string) ($extracted['revenue'] ?? '')) ?: null;

        $available = [];
        if ($industry !== null) {
            $available[] = 'industry';
        }
        if ($brief->territories !== []) {
            $available[] = 'territory';
        } elseif ($territory !== null) {
            $available[] = 'territory';
        }
        if ($companySize !== null) {
            $available[] = 'companySize';
        }
        if ($revenue !== null) {
            $available[] = 'revenue';
        }

        return $this->icpFilter->passes(
            $brief,
            new CandidateCompany(
                industry: $industry,
                companySize: $companySize,
                revenue: $revenue,
                territory: $territory,
            ),
            $available,
        );
    }

    /**
     * @param  array<string, mixed>  $extracted
     * @param  array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}  $scores
     */
    private function resolveQueryMatch(
        bool $hasUserQuery,
        bool $factualQuery,
        bool $fromListicle,
        string $displayName,
        array $extracted,
        array $scores,
    ): bool {
        if (! $hasUserQuery) {
            return ($scores['query_relevance_score'] ?? 0) >= 50;
        }

        if ($factualQuery && $this->personNameValidator->isValidPersonName($displayName, $extracted)) {
            return true;
        }

        if ($fromListicle && $this->personNameValidator->isValidPersonName($displayName, $extracted)) {
            return true;
        }

        return ($scores['query_relevance_score'] ?? 0) >= 50;
    }

    /**
     * Final creatability gate: only persist leads that look like real people or companies.
     *
     * @param  array<string, mixed>  $extracted
     */
    private function passesCreatabilityGate(
        IcpBrief $brief,
        string $displayName,
        array $extracted,
        bool $fromListicle,
    ): bool {
        if ($displayName === '') {
            return false;
        }

        if (! $fromListicle && $this->queryIntent->looksLikeContentOrGenericPhrase($displayName)) {
            return false;
        }

        if ($brief->isPeopleSearch()) {
            if (! $this->personNameValidator->isValidPersonName($displayName, $extracted)) {
                return false;
            }

            // Authoritative / listicle digests synthesize people from articles — no profile URL yet.
            if (
                $fromListicle
                || $brief->isListiclePeopleQuery()
                || $brief->isAuthoritativePeopleQuery()
            ) {
                return true;
            }

            // First-batch people must have a usable profile URL (LinkedIn /in/ or other profile).
            return $this->hasPersonProfileUrl($extracted);
        }

        return $this->companyNameValidator->isValidCompanyName($displayName, $extracted);
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function hasPersonProfileUrl(array $extracted): bool
    {
        $linkedin = trim((string) ($extracted['linkedin_url'] ?? ''));
        if ($linkedin !== '' && str_contains(mb_strtolower($linkedin), 'linkedin.com/in/')) {
            return true;
        }

        $profileUrls = $extracted['profile_urls'] ?? [];
        if (! is_array($profileUrls)) {
            return false;
        }

        foreach ($profileUrls as $url) {
            if (! is_string($url) || trim($url) === '') {
                continue;
            }
            if ($this->looksLikeProfileUrl($url)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $extracted
     * @return array<string, mixed>
     */
    private function attachHitProfileUrls(array $extracted, RawDiscoveryHit $hit): array
    {
        $hitUrl = trim((string) ($hit->url ?? ''));
        if ($hitUrl !== '' && $this->looksLikeProfileUrl($hitUrl)) {
            $existing = is_array($extracted['profile_urls'] ?? null) ? $extracted['profile_urls'] : [];
            $existing[] = $hitUrl;
            $extracted['profile_urls'] = array_values(array_unique(array_filter(
                array_map(static fn($u) => is_string($u) ? trim($u) : '', $existing),
            )));

            if (
                str_contains(mb_strtolower($hitUrl), 'linkedin.com/in/')
                && trim((string) ($extracted['linkedin_url'] ?? '')) === ''
            ) {
                $extracted['linkedin_url'] = $hitUrl;
            }
        }

        return $extracted;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function isContactReady(array $extracted, array $profileUrls): bool
    {
        $email = trim((string) ($extracted['email'] ?? ''));
        $phone = trim((string) ($extracted['phone'] ?? ''));
        $linkedin = trim((string) ($extracted['linkedin_url'] ?? ''));
        $title = trim((string) ($extracted['title'] ?? ''));
        $company = trim((string) ($extracted['company'] ?? ''));

        if ($email !== '' || $phone !== '') {
            return true;
        }

        if ($linkedin !== '' || $profileUrls !== []) {
            return true;
        }

        return $title !== '' && $company !== '';
    }

    private function isAuthoritativeUrl(?string $url): bool
    {
        if (! filled($url)) {
            return false;
        }

        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));

        return str_contains($host, 'forbes.com')
            || str_contains($host, 'bloomberg.com')
            || str_contains($host, 'wikipedia.org')
            || str_contains($host, 'visualcapitalist.com');
    }

    private function looksLikeProfileUrl(string $url): bool
    {
        $normalized = trim($url);
        if ($normalized === '') {
            return false;
        }

        $withScheme = str_contains($normalized, '://') ? $normalized : 'https://' . $normalized;
        $host = mb_strtolower((string) (parse_url($withScheme, PHP_URL_HOST) ?: ''));
        $path = (string) (parse_url($withScheme, PHP_URL_PATH) ?: '');

        if (str_contains($host, 'linkedin.com')) {
            if (preg_match('~/(posts|pulse|feed|recent-activity)\b~i', $path) || preg_match('~activity-~i', $path)) {
                return false;
            }

            return (bool) preg_match('~/(in|company)/[^/]+~', $path);
        }

        return str_contains($host, 'about.me')
            || str_contains($host, 'crunchbase.com')
            || str_contains($host, 'xing.com')
            || str_contains($host, 'wellfound.com')
            || str_contains($host, 'angel.co');
    }

    /** True when a URL/host must never be stored as a company website field. */
    private function isProfileOrSocialHost(string $urlOrHost): bool
    {
        $normalized = trim($urlOrHost);
        if ($normalized === '') {
            return false;
        }

        $withScheme = str_contains($normalized, '://') ? $normalized : 'https://' . $normalized;
        $host = mb_strtolower((string) (parse_url($withScheme, PHP_URL_HOST) ?: $normalized));

        return str_contains($host, 'linkedin.com')
            || str_contains($host, 'about.me')
            || str_contains($host, 'crunchbase.com')
            || str_contains($host, 'xing.com')
            || str_contains($host, 'wellfound.com')
            || str_contains($host, 'angel.co');
    }

    /**
     * Trusted identity for ICP unknown-firmographic keep: entity-matching profile URL.
     * People need /in/{slug}; companies need /company/{slug}; never posts/articles.
     *
     * @param  array<string, mixed>  $extracted
     */
    private function hasTrustedEntityProfileUrl(IcpBrief $brief, array $extracted, RawDiscoveryHit $hit): bool
    {
        $wantPerson = $brief->isPeopleSearch();
        $candidates = [];

        foreach (['linkedin_url', 'profile_url', 'url'] as $key) {
            $value = trim((string) ($extracted[$key] ?? ''));
            if ($value !== '') {
                $candidates[] = $value;
            }
        }

        $profileUrls = $extracted['profile_urls'] ?? null;
        if (is_array($profileUrls)) {
            foreach ($profileUrls as $url) {
                $value = trim((string) $url);
                if ($value !== '') {
                    $candidates[] = $value;
                }
            }
        }

        if (filled($hit->url)) {
            $candidates[] = (string) $hit->url;
        }

        foreach ($candidates as $url) {
            if (! $this->looksLikeProfileUrl($url)) {
                continue;
            }

            $withScheme = str_contains($url, '://') ? $url : 'https://' . $url;
            $path = (string) (parse_url($withScheme, PHP_URL_PATH) ?: '');
            $host = mb_strtolower((string) (parse_url($withScheme, PHP_URL_HOST) ?: ''));

            if (str_contains($host, 'linkedin.com')) {
                if ($wantPerson && preg_match('~/in/[^/]+~', $path)) {
                    return true;
                }
                if (! $wantPerson && preg_match('~/company/[^/]+~', $path)) {
                    return true;
                }

                continue;
            }

            // Non-LinkedIn trusted profile hosts count for either entity when looksLikeProfileUrl passed.
            return true;
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $extracted
     * @param  array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}  $scores
     * @return array{company: \App\Models\Company, payload: array<string, mixed>}
     */
    private function createLeadFromExtraction(
        Organization $organization,
        IcpProfile $icp,
        IcpBrief $brief,
        RawDiscoveryHit $hit,
        array $extracted,
        string $displayName,
        array $scores,
        bool $icpRecommended,
        bool $queryMatch,
    ): array {
        $entityType = $brief->isPeopleSearch() ? 'person' : 'company';
        $contactPerson = trim((string) ($extracted['contact_person'] ?? ''));
        if ($entityType === 'company' && $contactPerson === '') {
            $contactPerson = trim((string) ($extracted['person_name'] ?? ''));
            if ($contactPerson !== '' && ! $this->personNameValidator->isValidPersonName($contactPerson, $extracted)) {
                $contactPerson = '';
            }
        }

        $companyName = $entityType === 'company'
            ? $displayName
            : trim((string) ($extracted['company'] ?? $extracted['name'] ?? $displayName));

        $company = $this->cache->upsertFromHit($organization, $hit, [
            'name' => $companyName !== '' ? $companyName : $displayName,
            'sector' => $extracted['sector'] ?? $hit->sector,
            'location' => $extracted['location'] ?? $hit->location,
            'summary' => $extracted['summary'] ?? $hit->snippet,
            'business_fields' => $extracted['business_fields'] ?? null,
            'commercial_signals' => $extracted['commercial_signals'] ?? null,
            'icp_fit_score' => $scores['icp_fit_score'],
            'intent_score' => $scores['intent_score'],
            'priority_score' => $scores['priority_score'],
        ]);

        $signalUrl = is_string($hit->url) ? mb_substr($hit->url, 0, 2048) : null;
        $signalSnippet = is_string($hit->snippet) ? mb_substr($hit->snippet, 0, 5000) : null;

        try {
            LeadSignal::query()->create([
                'organization_id' => $organization->id,
                'company_id' => $company->id,
                'signal_type' => 'discovery',
                'strength' => $scores['icp_fit_score'] / 100,
                'score' => $scores['priority_score'],
                'source' => $hit->provider,
                'url' => $signalUrl,
                'snippet' => $signalSnippet,
                'detected_at' => now(),
            ]);
        } catch (\Throwable) {
            // Signal persistence must never abort lead creation.
        }

        $profileUrls = is_array($extracted['profile_urls'] ?? null)
            ? array_values(array_filter($extracted['profile_urls'], fn($u) => is_string($u) && trim($u) !== ''))
            : [];

        $candidateUrls = [];
        foreach (
            array_merge(
                [trim((string) ($extracted['linkedin_url'] ?? ''))],
                $profileUrls,
            ) as $candidateUrl
        ) {
            if (is_string($candidateUrl) && trim($candidateUrl) !== '') {
                $candidateUrls[] = trim($candidateUrl);
            }
        }

        // Always attach LinkedIn / social profile URLs found on the discovery hit.
        foreach ([trim((string) ($hit->url ?? '')), trim((string) ($hit->website ?? ''))] as $hitUrl) {
            if ($hitUrl === '' || ! $this->looksLikeProfileUrl($hitUrl)) {
                continue;
            }
            $candidateUrls[] = $hitUrl;
        }

        $trustedUrls = [];
        if (filled($hit->url)) {
            $trustedUrls[] = (string) $hit->url;
        }

        $validUrls = $this->profileUrlValidator->filterValid($candidateUrls, $trustedUrls);
        $allowCompanyLinkedIn = $entityType === 'company';
        $profileUrls = array_values(array_filter(
            $validUrls,
            function (string $url) use ($allowCompanyLinkedIn): bool {
                $host = mb_strtolower((string) (parse_url($url, PHP_URL_HOST) ?: ''));
                if (! str_contains($host, 'linkedin.com')) {
                    return true;
                }
                $path = (string) parse_url($url, PHP_URL_PATH);
                if (preg_match('~/in/~', $path)) {
                    return true;
                }

                return $allowCompanyLinkedIn && (bool) preg_match('~/company/~', $path);
            }
        ));

        $linkedinUrl = '';
        foreach ($validUrls as $url) {
            $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
            $path = (string) parse_url($url, PHP_URL_PATH);
            if (! str_contains($host, 'linkedin.com')) {
                continue;
            }
            // Never treat posts/pulse/feed as a profile URL.
            if (preg_match('~/(posts|pulse|feed|recent-activity)\b~i', $path) || preg_match('~activity-~i', $path)) {
                continue;
            }
            if ($entityType === 'person' && preg_match('~/in/[^/]+~', $path)) {
                $linkedinUrl = $url;
                break;
            }
            if ($entityType === 'company' && preg_match('~/company/[^/]+~', $path)) {
                $linkedinUrl = $url;
                break;
            }
        }

        $sourceUrl = trim((string) (
            ($linkedinUrl !== '' ? $linkedinUrl : null)
            ?? ($profileUrls[0] ?? null)
            ?? ($extracted['business_fields']['source_url'] ?? null)
        ));
        // Discovery hit URLs are often posts/articles — only use as source when they are real profiles.
        if ($sourceUrl === '' && filled($hit->url) && $this->looksLikeProfileUrl((string) $hit->url)) {
            $hitPath = (string) (parse_url((string) $hit->url, PHP_URL_PATH) ?: '');
            $hitOk = $entityType === 'person'
                ? (bool) preg_match('~/in/[^/]+~', $hitPath)
                : (bool) preg_match('~/company/[^/]+~', $hitPath);
            if ($hitOk) {
                $sourceUrl = (string) $hit->url;
            }
        }

        $nextAction = trim((string) ($extracted['next_action'] ?? ''));
        if ($nextAction === '') {
            $nextAction = $entityType === 'company'
                ? 'Review account fit and identify a decision maker'
                : 'Review and qualify this lead';
        }

        $summary = trim((string) ($extracted['summary'] ?? ''));
        if ($summary === '') {
            $summary = $scores['rationale'];
        }

        $email = trim((string) ($extracted['email'] ?? ''));
        $phone = trim((string) ($extracted['phone'] ?? ''));
        $website = trim((string) ($extracted['website'] ?? ''));
        if ($website !== '' && $this->isProfileOrSocialHost($website)) {
            $website = '';
        }
        if ($website === '' && filled($hit->website)) {
            $hitWebsite = trim((string) $hit->website);
            if (! $this->isProfileOrSocialHost($hitWebsite)) {
                $website = $hitWebsite;
            }
        }
        if ($website === '' && filled($hit->url)) {
            $host = parse_url((string) $hit->url, PHP_URL_HOST);
            if (is_string($host) && $host !== '' && ! $this->isProfileOrSocialHost($host)) {
                $website = $host;
            }
        }

        $contactReady = $this->isContactReady(
            array_merge($extracted, ['linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null]),
            $profileUrls,
        );
        // Tri-state mirror of SocialSignal.enrichment_status (see
        // docs/backend_implementation_plan.md) — 'contact_ready' above stays for
        // backward compatibility; this additionally distinguishes "we tried and
        // found nothing" from "we never tried" (e.g. enrichContactDetails is off
        // on this ICP), which contact_ready alone cannot express.
        $contactStatus = ! ($extracted['enrichment_attempted'] ?? false)
            ? 'not_attempted'
            : ($contactReady ? 'found' : 'not_found');

        $metaCompany = $entityType === 'company'
            ? $displayName
            : ($extracted['company'] ?? null);

        $lead = Lead::query()->create([
            'organization_id' => $organization->id,
            'company_id' => $company->id,
            'icp_profile_id' => $icp->id,
            'name' => $displayName,
            'source' => $hit->provider,
            'score' => $scores['priority_score'],
            'summary' => $summary,
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'meta' => array_filter([
                'entity_type' => $entityType,
                'rationale' => $scores['rationale'],
                'low_confidence' => (bool) ($extracted['low_confidence'] ?? false),
                'title' => $extracted['title'] ?? null,
                'company' => $metaCompany,
                'contact_person' => $entityType === 'company' && $contactPerson !== '' ? $contactPerson : null,
                'location' => $extracted['location'] ?? null,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'website' => $website !== '' ? $website : null,
                'profile_urls' => $profileUrls !== [] ? $profileUrls : null,
                'linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null,
                'source_url' => $sourceUrl !== '' ? $sourceUrl : null,
                'next_action' => $nextAction,
                'enrichment_confidence' => $extracted['enrichment_confidence'] ?? null,
                'contact_ready' => $contactReady,
                'contact_status' => $contactStatus,
                'contact_enrichment_tier' => $extracted['contact_enrichment_tier'] ?? null,
                'contact_enrichment_provider' => $extracted['contact_enrichment_provider'] ?? null,
                'icp_recommended' => $icpRecommended,
                'icp_fit_score' => (int) round($scores['icp_fit_score']),
                'intent_score' => (int) round($scores['intent_score']),
                'query_relevance_score' => (int) round($scores['query_relevance_score']),
                'query_match' => $queryMatch,
                'icp_relevance_reason' => trim((string) ($scores['icp_relevance_reason'] ?? '')) ?: null,
            ], fn($v) => $v !== null && $v !== ''),
        ]);

        return [
            'company' => $company,
            'payload' => [
                'id' => $lead->id,
                'name' => $lead->name,
                'source' => $lead->source,
                'score' => (int) round((float) $lead->score),
                'summary' => $lead->summary,
                'entity_type' => $entityType,
                'title' => $extracted['title'] ?? null,
                'company' => $metaCompany,
                'contact_person' => $entityType === 'company' && $contactPerson !== '' ? $contactPerson : null,
                'location' => $extracted['location'] ?? null,
                'website' => $website !== '' ? $website : null,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null,
                'profile_urls' => $profileUrls,
                'contact_ready' => $contactReady,
                'contact_status' => $contactStatus,
                'contact_enrichment_tier' => $extracted['contact_enrichment_tier'] ?? null,
                'contact_enrichment_provider' => $extracted['contact_enrichment_provider'] ?? null,
                'next_action' => $nextAction,
                'source_url' => $sourceUrl !== '' ? $sourceUrl : null,
                'save_status' => $lead->save_status,
                'crm_synced' => filled($lead->synced_to_f23_at),
                'crm_duplicate' => filled($lead->crm_duplicate_of),
                'crm_duplicate_reason' => $lead->crm_duplicate_reason,
                'crm_fields_updated' => $lead->crm_fields_updated ?? [],
                'f23_lead_id' => $lead->f23_lead_id,
                'low_confidence' => (bool) ($extracted['low_confidence'] ?? false),
                'icp_recommended' => $icpRecommended,
                'icp_fit_score' => (int) round($scores['icp_fit_score']),
                'intent_score' => (int) round($scores['intent_score']),
                'query_relevance_score' => (int) round($scores['query_relevance_score']),
                'query_match' => $queryMatch,
                'icp_relevance_reason' => trim((string) ($scores['icp_relevance_reason'] ?? '')) ?: null,
            ],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $leadsPayload
     * @return list<array<string, mixed>>
     */
    private function sortLeadsPayload(array $leadsPayload): array
    {
        usort($leadsPayload, function (array $a, array $b): int {
            $queryMatchA = ($a['query_match'] ?? false) ? 1 : 0;
            $queryMatchB = ($b['query_match'] ?? false) ? 1 : 0;
            if ($queryMatchA !== $queryMatchB) {
                return $queryMatchB <=> $queryMatchA;
            }

            $icpA = ($a['icp_recommended'] ?? false) ? 1 : 0;
            $icpB = ($b['icp_recommended'] ?? false) ? 1 : 0;
            if ($icpA !== $icpB) {
                return $icpB <=> $icpA;
            }

            return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
        });

        return $leadsPayload;
    }

    private function appendStage(DiscoveryRun $run, string $stage): void
    {
        $stages = $run->stages ?? [];
        $stages[] = $stage;
        $run->update(['stages' => $stages]);
    }

    private function updateProgress(
        DiscoveryRun $run,
        int $step,
        ?int $sourcesChecked = null,
        ?int $candidatesFound = null,
    ): void {
        $summary = is_array($run->result_summary) ? $run->result_summary : [];
        $progress = $summary['progress'] ?? [
            'total_steps' => 4,
            'sources_checked' => 0,
            'candidates_found' => 0,
        ];

        $progress['step'] = $step;
        $progress['total_steps'] = 4;

        if ($sourcesChecked !== null) {
            $progress['sources_checked'] = $sourcesChecked;
        }
        if ($candidatesFound !== null) {
            $progress['candidates_found'] = $candidatesFound;
        }

        $summary['progress'] = $progress;
        $run->update(['result_summary' => $summary]);
    }

    /**
     * @param  array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}  $scores
     * @param  array<string, mixed>  $extracted
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}
     */
    private function applyScorePenalties(
        array $scores,
        string $displayName,
        IcpBrief $brief,
        array $extracted,
        bool $fromListicle = false,
    ): array {
        $contentPenalty = match ($this->qualityThreshold) {
            self::QUALITY_VOLUME => 20,
            self::QUALITY_BALANCED => 28,
            default => 35,
        };
        $lowConfidencePenalty = match ($this->qualityThreshold) {
            self::QUALITY_VOLUME => 8,
            self::QUALITY_BALANCED => 12,
            default => 15,
        };

        if (mb_strtolower($displayName) === mb_strtolower($brief->name)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - 40);
            $scores['rationale'] .= ' Penalized: name matched ICP profile.';
        }

        if (! $fromListicle && ! $brief->isListiclePeopleQuery() && $this->queryIntent->looksLikeContentOrGenericPhrase($displayName)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - $contentPenalty);
            $scores['rationale'] .= ' Penalized: looks like article content.';
        }

        if ((bool) ($extracted['low_confidence'] ?? false)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - $lowConfidencePenalty);
            $scores['rationale'] .= ' Lower confidence extraction.';
        }

        return $scores;
    }

    private function effectiveMinMatchScore(IcpBrief $brief): int
    {
        return match ($this->qualityThreshold) {
            self::QUALITY_VOLUME => min($brief->minMatchScore, 50),
            self::QUALITY_BALANCED => min($brief->minMatchScore, 55),
            default => $brief->minMatchScore,
        };
    }
}
