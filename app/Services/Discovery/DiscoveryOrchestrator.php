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
    public const FIRST_BATCH_SOFT_SECONDS = 50;

    /** Stop discovering and complete with whatever we have (seconds). */
    public const HARD_DEADLINE_SECONDS = 150;

    private string $qualityThreshold = self::QUALITY_STRICT;

    private float $deadlineAt = 0.0;

    private float $startedAt = 0.0;

    private bool $deferContactEnrichment = true;

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
    ): array {
        $run = $existingRun ?? DiscoveryRun::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user?->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $chatSessionId,
            'status' => 'running',
            'query' => $query,
            'intent' => $intent,
            'stages' => ['analyzing_brief'],
            'started_at' => now(),
        ]);

        if ($existingRun) {
            $run->update([
                'status' => 'running',
                'query' => $query,
                'intent' => $intent,
                'stages' => ['analyzing_brief'],
                'started_at' => now(),
            ]);
        }

        try {
            $this->startedAt = microtime(true);
            $this->deadlineAt = $this->startedAt + self::HARD_DEADLINE_SECONDS;
            $this->deferContactEnrichment = $deferContactEnrichment;
            $this->enrichment->setDeferContactWaterfall($deferContactEnrichment);

            $brief = IcpBrief::fromIcpProfile($icp, $query);
            $hasUserQuery = $brief->hasUserQuery();
            $effectiveLimit = min(self::MAX_LEAD_LIMIT, max(1, $limit > 0 ? $limit : $brief->requestedLimit));
            $this->qualityThreshold = $this->resolveQualityThreshold($effectiveLimit);
            $ctx = new SearchContext($organization->id, $user?->id, $effectiveLimit, $intent);

            $this->updateProgress($run, 1, 0, 0);

            $this->appendStage($run, 'searching_sources');
            $this->enrichment->resetBudget();
            $this->profileUrlValidator->resetBudget();

            $isAuthoritativeQuery = $brief->isAuthoritativePeopleQuery();
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

            $minAcceptableYield = max(3, (int) ceil($effectiveLimit / 2));
            $minUsableBatch = max(1, (int) ceil($effectiveLimit / 4));
            $softCompletedEarly = false;

            for ($pass = 0; $pass <= self::MAX_BACKFILL_PASSES; $pass++) {
                if ($this->pastDeadline()) {
                    $softCompletedEarly = true;
                    break;
                }

                $remaining = $effectiveLimit - count($leadsPayload);
                if ($remaining <= 0) {
                    break;
                }

                $isBackfill = $pass > 0;
                if ($isBackfill) {
                    // Skip deeper search once we have a usable first batch or soft time elapsed.
                    if (count($leadsPayload) >= $minAcceptableYield
                        || (count($leadsPayload) >= $minUsableBatch && $this->pastSoftDeadline())
                        || count($leadsPayload) >= 1 && $this->pastSoftDeadline()) {
                        break;
                    }

                    $this->qualityThreshold = self::QUALITY_VOLUME;
                    $this->appendStage($run, 'backfill_pass_' . $pass);
                    $backfillPasses++;

                    $backfillQueries = $this->queryVariationGenerator->generateBackfill(
                        $brief,
                        $effectiveLimit,
                        $allQueriesExecuted,
                    );

                    if ($backfillQueries === []) {
                        break;
                    }

                    [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits(
                        $brief,
                        $ctx,
                        $effectiveLimit,
                        $backfillQueries,
                    );
                } else {
                    [$hits, $sourcesChecked, $fanOutMeta] = $this->collectHits($brief, $ctx, $effectiveLimit);
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

                if ($isAuthoritativeQuery && ! $isBackfill) {
                    [$passLeads, $passCompanies, $passFound] = $this->processAuthoritativePeopleQuery(
                        $organization,
                        $icp,
                        $brief,
                        $hits,
                        $intent,
                        $hasUserQuery,
                        $effectiveLimit,
                        $sourcesChecked,
                        $run,
                        $seenLeadNames,
                    );
                } else {
                    [$passLeads, $passCompanies, $passFound] = $this->processStandardQuery(
                        $organization,
                        $icp,
                        $brief,
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

                if (count($leadsPayload) >= $effectiveLimit) {
                    break;
                }

                // First pass: stop when we have enough for a first batch.
                if (! $isBackfill && count($leadsPayload) >= $minAcceptableYield) {
                    break;
                }

                if (count($leadsPayload) >= $minUsableBatch && $this->pastSoftDeadline()) {
                    $softCompletedEarly = true;
                    break;
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
                'result_summary' => array_merge(
                    is_array($run->result_summary) ? $run->result_summary : [],
                    [
                        'lead_count' => count($leadsPayload),
                        'sources_enabled' => collect($this->sources)->filter->isEnabled()->map->key()->values()->all(),
                        'queries_executed' => $allQueriesExecuted,
                        'sources_hit_count' => $allSourcesHitCount,
                        'candidates_extracted' => array_sum($allSourcesHitCount),
                        'candidates_passed_gates' => $candidatesFound,
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

    private function shouldUseFanOut(int $limit): bool
    {
        return $limit >= QueryVariationGenerator::FAN_OUT_THRESHOLD;
    }

    private function resolveQualityThreshold(int $effectiveLimit): string
    {
        if ($effectiveLimit >= 50) {
            return self::QUALITY_VOLUME;
        }

        if ($effectiveLimit >= 20) {
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
            $variations = [$brief->searchQuery()];
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

        foreach ($queriesExecuted as $variationQuery) {
            if ($this->pastDeadline()) {
                break;
            }
            $variantBrief = $brief->withSearchQueryOverride($variationQuery);
            foreach ($otherSources as $source) {
                $batch = $source->search($variantBrief, $ctx);
                $key = $source->key();
                $sourcesHitCount[$key] = ($sourcesHitCount[$key] ?? 0) + $batch->count();
                $hits = $hits->merge($batch);
            }
        }

        $hits = $this->dedupeHits($hits);

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

        /** @var RawDiscoveryHit $hit */
        foreach ($hits->unique(fn(RawDiscoveryHit $h) => mb_strtolower($h->name)) as $hit) {
            if (count($candidates) >= $gatherCap || $this->pastDeadline()) {
                break;
            }

            // Gate junk titles before expensive GLM extract/score.
            if ($this->queryIntent->looksLikeContentOrGenericPhrase($hit->name)) {
                continue;
            }

            if ($brief->isPeopleSearch()) {
                $normalizedHit = $this->personNameValidator->normalizePersonName($hit->name);
                $probeName = $normalizedHit !== '' ? $normalizedHit : $hit->name;
                if (! $this->personNameValidator->isValidPersonName($probeName, [
                    'linkedin_url' => $hit->url,
                    'title' => $hit->snippet,
                    'company' => $hit->website,
                ]) && ! str_contains(mb_strtolower((string) $hit->url), 'linkedin.com/in/')) {
                    // Still allow company-shaped hits through extraction for company target flips.
                    if (! $this->companyNameValidator->isValidCompanyName($hit->name, [])) {
                        continue;
                    }
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
            if ($brief->isPeopleSearch() || filled($extracted['person_name'] ?? null)) {
                $normalized = $this->personNameValidator->normalizePersonName($displayName);
                if ($normalized !== '') {
                    $displayName = $normalized;
                    $extracted['person_name'] = $normalized;
                }
            }
            $fromListicle = (bool) ($extracted['from_listicle'] ?? false);

            $scores = $this->scoring->score(array_merge($extracted, [
                'name' => $displayName,
                'source' => $hit->source,
                'provider' => $hit->provider,
                'authoritative_source' => $this->isAuthoritativeUrl($hit->url),
            ]), $brief, $organization);

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
            $extracted = $candidate['extracted'];
            $hit = $candidate['hit'];
            $fromListicle = $candidate['fromListicle'];

            if (! $this->passesCreatabilityGate($brief, $displayName, $extracted, $fromListicle)) {
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

            // Below-threshold ICP-only leads go into a secondary pool (shown after qualifying ones)
            // instead of being hard-dropped — ICP min score stays unchanged as an ordering signal.
            $minPriority = $this->effectiveMinMatchScore($brief);
            $isSecondary = $intent === 'generate_leads'
                && ! $hasUserQuery
                && $scores['priority_score'] < $minPriority;

            if ($brief->isPeopleSearch() || filled($extracted['person_name'] ?? null)) {
                $enrichedProfile = $this->enrichment->enrich(
                    $organization,
                    $icp,
                    $displayName,
                    $brief->query,
                    $extracted,
                );
                $extracted = $enrichedProfile->mergeIntoExtraction($extracted);
            } elseif (! $brief->isPeopleSearch()) {
                $extracted = $this->enrichment->enrichCompanyDecisionMaker(
                    $organization,
                    $icp,
                    $displayName,
                    $brief,
                    $extracted,
                );
            }

            // Prefer a real person name on the card when enrichment found a contact.
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

            $leadPayload = $this->createLeadFromExtraction(
                $organization,
                $icp,
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

        if ($brief->isPeopleSearch() || filled($extracted['person_name'] ?? null)) {
            return $this->personNameValidator->isValidPersonName($displayName, $extracted);
        }

        return $this->companyNameValidator->isValidCompanyName($displayName, $extracted);
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

    /**
     * @param  array<string, mixed>  $extracted
     * @param  array{icp_fit_score: float, intent_score: float, priority_score: float, query_relevance_score: float, rationale: string}  $scores
     * @return array{company: \App\Models\Company, payload: array<string, mixed>}
     */
    private function createLeadFromExtraction(
        Organization $organization,
        IcpProfile $icp,
        RawDiscoveryHit $hit,
        array $extracted,
        string $displayName,
        array $scores,
        bool $icpRecommended,
        bool $queryMatch,
    ): array {
        $companyName = trim((string) ($extracted['company'] ?? $extracted['name'] ?? $displayName));

        $company = $this->cache->upsertFromHit($organization, $hit, [
            'name' => $companyName,
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
                'confidence' => $scores['icp_fit_score'] / 100,
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

        $trustedUrls = [];
        if (filled($hit->url)) {
            $trustedUrls[] = (string) $hit->url;
        }

        $validUrls = $this->profileUrlValidator->filterValid($candidateUrls, $trustedUrls);
        $profileUrls = array_values(array_filter(
            $validUrls,
            fn(string $url): bool => ! str_contains(mb_strtolower(parse_url($url, PHP_URL_HOST) ?: ''), 'linkedin.com')
                || (bool) preg_match('~/in/~', (string) parse_url($url, PHP_URL_PATH))
        ));

        $linkedinUrl = '';
        foreach ($validUrls as $url) {
            $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
            $path = (string) parse_url($url, PHP_URL_PATH);
            if (str_contains($host, 'linkedin.com') && preg_match('~/in/~', $path)) {
                $linkedinUrl = $url;
                break;
            }
        }
        if ($linkedinUrl === '' && $validUrls !== []) {
            // Prefer first valid URL as linkedin_url only when it is LinkedIn-shaped; otherwise leave blank.
            $first = $validUrls[0];
            if (str_contains(mb_strtolower((string) parse_url($first, PHP_URL_HOST)), 'linkedin.com')) {
                $linkedinUrl = $first;
            }
        }

        // Keep hit URL as source_url fallback even if not a profile link.
        $sourceUrl = trim((string) (
            ($linkedinUrl !== '' ? $linkedinUrl : null)
            ?? ($profileUrls[0] ?? null)
            ?? ($extracted['business_fields']['source_url'] ?? null)
            ?? $hit->url
        ));

        $nextAction = trim((string) ($extracted['next_action'] ?? ''));
        if ($nextAction === '') {
            $nextAction = 'Review and qualify this lead';
        }

        $summary = trim((string) ($extracted['summary'] ?? ''));
        if ($summary === '') {
            $summary = $scores['rationale'];
        }

        $email = trim((string) ($extracted['email'] ?? ''));
        $phone = trim((string) ($extracted['phone'] ?? ''));
        $contactReady = $this->isContactReady(
            array_merge($extracted, ['linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null]),
            $profileUrls,
        );

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
                'rationale' => $scores['rationale'],
                'low_confidence' => (bool) ($extracted['low_confidence'] ?? false),
                'title' => $extracted['title'] ?? null,
                'company' => $extracted['company'] ?? null,
                'location' => $extracted['location'] ?? null,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'website' => $extracted['website'] ?? null,
                'profile_urls' => $profileUrls !== [] ? $profileUrls : null,
                'linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null,
                'source_url' => $sourceUrl !== '' ? $sourceUrl : null,
                'next_action' => $nextAction,
                'enrichment_confidence' => $extracted['enrichment_confidence'] ?? null,
                'contact_ready' => $contactReady,
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
                'title' => $extracted['title'] ?? null,
                'company' => $extracted['company'] ?? null,
                'location' => $extracted['location'] ?? null,
                'website' => $extracted['website'] ?? null,
                'email' => $email !== '' ? $email : null,
                'phone' => $phone !== '' ? $phone : null,
                'linkedin_url' => $linkedinUrl !== '' ? $linkedinUrl : null,
                'profile_urls' => $profileUrls,
                'contact_ready' => $contactReady,
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
