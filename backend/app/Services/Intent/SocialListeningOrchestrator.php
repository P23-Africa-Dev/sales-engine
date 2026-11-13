<?php

namespace App\Services\Intent;

use App\Jobs\EnrichSocialSignalJob;
use App\Models\ApiUsage;
use App\Models\Company;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningRun;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\CompanyFirmographicsResolver;
use App\Services\IcpFiltering\DTO\IcpFilterResult;
use App\Services\IcpFiltering\IcpQualifier;
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

    private const DEFAULT_ENRICH_CAP = 90;

    private const DEFAULT_PAGE_DATE_CAP = 12;

    /** Openings scoring between this and the account's minimum are kept as "possible openings". */
    private const POSSIBLE_OPENING_FLOOR = 40.0;

    private const DEFAULT_HYDRATE_CAP = 20;

    private const RESULTS_PER_QUERY = 10;

    private const LOW_YIELD_FLOOR = 8;

    /** Native APIs return full text and exact dates, so they are asked first. */
    private const FULL_TEXT_SOURCES = ['reddit_native', 'x_native'];

    /** Search-engine sources, in rough order of buyer-intent yield. */
    private const PRIMARY_SOURCES = ['reddit', 'x_mentions', 'linkedin_public'];

    private const LOW_YIELD_SOURCES = ['meta_pages'];

    private const LAST_RESORT_SOURCES = ['youtube', 'meta_graph_pages'];

    /** Company-event sources: only signal-type queries routed to them are searched here. */
    private const EVENT_SOURCES = ['news', 'job_boards'];

    /** Signal types whose evidence is a job post rather than a news story. */
    private const HIRING_SIGNAL_KEYS = ['hiring_job_post', 'open_developer_roles_unfilled', 'diplomatic_corporate_hiring_lagos'];

    /** A company event already saved within this many days is not saved again. */
    private const EVENT_DEDUPE_DAYS = 30;

    /** Review slots reserved for company-event posts out of the per-run review budget. */
    private const DEFAULT_EVENT_REVIEW_SHARE = 60;

    /** Companies looked up (industry, size, headquarters) per run. */
    private const DEFAULT_FIRMOGRAPHIC_LOOKUPS = 20;

    /** News/job-board calls per run, on top of the social search budget. */
    private const DEFAULT_MAX_EVENT_CALLS = 30;

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
        private readonly IcpQualifier $icpQualifier = new IcpQualifier,
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
        $this->dailyCap = (int) config('services.social_listening.daily_api_cap', 600);
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
                ? $this->activeDefinitions($organization->id, $brief, $profile)
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

            $possible = 0;
            $icpRejected = 0;
            $unlabeled = 0;
            $typeMismatch = 0;
            $opportunities = 0;
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

            // A company event is judged against its own type's window (e.g. 180 days).
            $eventWindows = $definitions->mapWithKeys(
                fn (SignalTypeDefinition $definition): array => [$definition->key => $this->eventWindowDays($definition, $appliedWindow)],
            )->all();

            $candidates = $this->hydrateReddit($candidates);
            $candidates = $this->hydratePageDates($candidates);

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
                    $eventWindows[$entry['signalTypeKey'] ?? ''] ?? $appliedWindow,
                    null,
                    allowInferredDate: false,
                );
                if (! $gate->admitted) {
                    $groundingRejected[$gate->reason] = ($groundingRejected[$gate->reason] ?? 0) + 1;
                    Log::debug('Social post dropped by grounding gate', [
                        'run_id' => $run->id,
                        'reason' => $gate->reason,
                        'platform' => $hit->platform,
                        'url' => $hit->postUrl,
                    ]);

                    continue;
                }

                $reason = $this->prefilter->rejection(
                    $hit,
                    $profile,
                    requireTopicCue: $entry['signalTypeKey'] === null,
                    companyEvent: $entry['signalTypeKey'] !== null,
                );
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
                $ready = $this->withinReviewBudget($ready, $enrichCap);
            }

            if ($modelUnavailable) {
                $notActionable += count($ready);
                $ready = [];
            }

            // Event checks for every typed post in one concurrent batch.
            $definitionsFor = [];
            $extractionItems = [];
            foreach ($ready as $index => $entry) {
                $definition = $entry['signalTypeKey'] !== null
                    ? $this->signalTypeRegistry->find($organization->id, $entry['signalTypeKey'])
                    : null;
                $definitionsFor[$index] = $definition;
                if ($definition !== null) {
                    $extractionItems[$index] = ['hit' => $entry['hit'], 'type' => $definition];
                }
            }
            $extracted = $extractionItems === []
                ? []
                : array_combine(array_keys($extractionItems), $this->signalExtractor->extractMany(array_values($extractionItems), $organization, $brief));

            $prepared = [];
            foreach ($ready as $index => $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                $postedAt = $entry['postedAt'];
                $signalTypeKey = $entry['signalTypeKey'];
                $signalTypeDefinition = $definitionsFor[$index];

                $detected = null;
                if ($signalTypeDefinition !== null) {
                    $detected = $extracted[$index];
                    if (! $detected->matched && in_array($hit->platform, ['news', 'jobs'], true)) {
                        // A news story or job post is only evidence of the event it was searched
                        // for; one that isn't that event is rejected, not reviewed as a buyer post.
                        $typeMismatch++;
                        $reason = preg_match('/^[a-z_]{3,40}$/', (string) $detected->rejectReason) ? $detected->rejectReason : 'mismatch';
                        $rejectedDetail['type_'.$reason] = ($rejectedDetail['type_'.$reason] ?? 0) + 1;

                        continue;
                    }
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

            $passedGate = [];
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
                    // The model already confirmed this event (company, event, source, date); a
                    // failed second, buyer-oriented review must not throw it away.
                    if ($detected->confirmedByModel) {
                        unset($enriched['from_heuristic']);
                    }
                }

                $quoteHaystack = trim($hit->postText."\n".($hit->title ?? '')."\n".($hit->snippet ?? ''));
                $gateReason = $this->opportunityGate->rejection(
                    $enriched,
                    $quoteHaystack,
                    $profile,
                    confirmedSignalType: $signalTypeDefinition !== null,
                );
                if ($gateReason !== null) {
                    // Developer trail for tuning the qualifier; never shown to users.
                    Log::debug('Social post rejected by opportunity gate', [
                        'run_id' => $run->id,
                        'reason' => $gateReason,
                        'mode' => $profile->mode,
                        'author_role' => $enriched['author_role'] ?? null,
                        'signal_type' => $enriched['signal_type'] ?? null,
                        'actionability' => $enriched['actionability'] ?? null,
                        'score' => $enriched['score'] ?? null,
                        'quote' => mb_substr((string) ($enriched['evidence_quote'] ?? ''), 0, 160),
                        'post' => mb_substr($hit->postText, 0, 200),
                        'url' => $hit->postUrl,
                    ]);
                    $notActionable++;
                    $rejectedDetail[$gateReason] = ($rejectedDetail[$gateReason] ?? 0) + 1;

                    continue;
                }

                // An event signal must be about a named company; general industry news is not one.
                if ($signalTypeDefinition !== null && trim((string) ($enriched['company_name'] ?? '')) === '') {
                    $notActionable++;
                    $rejectedDetail['no_company'] = ($rejectedDetail['no_company'] ?? 0) + 1;

                    continue;
                }

                $passedGate[] = compact('hit', 'postedAt', 'signalTypeKey', 'signalTypeDefinition', 'detected', 'enriched', 'score', 'hash', 'relevance') + ['family' => $item['family']];
            }

            // Who each company is (industry, size, headquarters) from public sources, looked up
            // in one batch, then a real ICP check: a company that contradicts the ICP is dropped.
            // Kill switch: with the ICP check off nothing is looked up or judged.
            $icpCheckEnabled = (bool) ($settings->icp_filter_enabled ?? true);
            // The "doesn't match the ICP → don't qualify" rule is about companies the account sells
            // to or partners with. A supplier or funder outside the territory can still be a real
            // opening, so for other needs a mismatch is shown, not dropped.
            $enforceIcp = in_array($profile->mode, ['sell', 'partner'], true);
            $firmographics = $icpCheckEnabled ? $this->firmographicsFor($passedGate) : [];

            $eventsThisRun = [];
            foreach ($passedGate as $candidate) {
                [
                    'hit' => $hit, 'postedAt' => $postedAt, 'signalTypeKey' => $signalTypeKey,
                    'signalTypeDefinition' => $signalTypeDefinition, 'detected' => $detected,
                    'enriched' => $enriched, 'score' => $score, 'hash' => $hash, 'relevance' => $relevance,
                ] = $candidate;
                $item = ['family' => $candidate['family']];

                $companyName = trim((string) ($enriched['company_name'] ?? ''));
                $isCompany = $companyName !== '' && mb_strtolower((string) ($enriched['entity_type'] ?? '')) !== 'individual';

                // One company event reported by several outlets is one opportunity.
                if ($signalTypeKey !== null && $companyName !== '') {
                    $eventKey = Company::normalizeName($companyName).'|'.$signalTypeKey;
                    if (isset($eventsThisRun[$eventKey]) || $this->eventAlreadySaved($organization->id, $icp->id, $companyName, $signalTypeKey)) {
                        $duplicate++;

                        continue;
                    }
                    $eventsThisRun[$eventKey] = true;
                }
                $firmo = $isCompany ? ($firmographics[$companyName] ?? CompanyFirmographicsResolver::empty()) : CompanyFirmographicsResolver::empty();
                $qualification = $isCompany && $icpCheckEnabled
                    ? $this->icpQualifier->qualify($brief, $firmo, [
                        'industry' => $enriched['industry'] ?? null,
                        'territory' => $detected?->territory ?? ($enriched['location_text'] ?? null),
                        'company_size' => $enriched['company_size'] ?? null,
                        'revenue' => $detected?->revenue,
                    ])
                    : ['status' => $icpCheckEnabled ? IcpQualifier::PARTIAL : 'not_checked', 'dimensions' => []];
                if ($qualification['status'] === IcpQualifier::NOT_QUALIFIED && $enforceIcp) {
                    $icpRejected++;
                    foreach ($qualification['dimensions'] as $dimension => $verdict) {
                        if ($verdict === IcpQualifier::CONTRADICTED) {
                            $rejectedDetail['icp_'.$dimension] = ($rejectedDetail['icp_'.$dimension] ?? 0) + 1;
                        }
                    }

                    continue;
                }
                $icpFilterResult = $icpCheckEnabled
                    ? new IcpFilterResult(
                        passed: $qualification['status'] !== IcpQualifier::NOT_QUALIFIED,
                        reasons: array_map(static fn (string $verdict): bool => $verdict !== IcpQualifier::CONTRADICTED, $qualification['dimensions']),
                    )
                    // Nothing was evaluated: say so, never a fabricated pass per field.
                    : new IcpFilterResult(passed: true, reasons: ['industry' => true, 'companySize' => true, 'revenue' => true, 'territory' => true]);
                if (blank($enriched['industry'] ?? null) && filled($firmo['industry'])) {
                    $enriched['industry'] = $firmo['industry'];
                }
                // A verified company event is worth acting on in proportion to how well the
                // company fits; buyer-intent wording (what the base score measures) isn't the test.
                if ($signalTypeDefinition !== null && $icpCheckEnabled) {
                    $floor = match ($qualification['status']) {
                        IcpQualifier::QUALIFIED => 85.0,
                        IcpQualifier::PARTIAL => 65.0,
                        default => 0.0,
                    };
                    $score = max($score, $floor);
                }

                // Shown on the Opportunities list: a verified company event whose company fits. A news
                // story or job post is about the company by construction; a social post only counts
                // when the company's own profile was found and the territory is confirmed, not unknown.
                $fromEventSource = in_array($hit->platform, ['news', 'jobs'], true);
                $companyFound = filled($firmo['linkedin_url'] ?? null) || filled($firmo['industry'] ?? null);
                $territoryConfirmed = ! array_key_exists('territory', $qualification['dimensions'])
                    || $qualification['dimensions']['territory'] === IcpQualifier::VERIFIED;
                $isOpportunity = $signalTypeKey !== null
                    && in_array($qualification['status'], [IcpQualifier::QUALIFIED, IcpQualifier::PARTIAL], true)
                    && ($fromEventSource || ($companyFound && $territoryConfirmed));

                // A real opening (it passed every check above) that scores under the account's
                // minimum is kept as a clearly-labelled "possible opening" instead of thrown away.
                $tier = 'strong';
                if ($score < (float) $settings->min_score) {
                    if ($score < self::POSSIBLE_OPENING_FLOOR) {
                        $belowMinScore++;

                        continue;
                    }
                    $tier = 'possible';
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
                        'opportunity_tier' => $tier,
                        'author_role' => $enriched['author_role'] ?? null,
                        'opportunity_kind' => $enriched['opportunity_kind'] ?? null,
                        'query_family' => $item['family'],
                        'listening_mode' => $profile->mode,
                        'icp_status' => $qualification['status'],
                        'opportunity' => $isOpportunity,
                        'icp_dimensions' => $qualification['dimensions'],
                        'firmographics' => $isCompany ? array_filter([
                            'industry' => $firmo['industry'],
                            'employee_range' => $firmo['employee_range'],
                            'headquarters' => $firmo['headquarters'],
                            'revenue' => $firmo['revenue'],
                            'linkedin_url' => $firmo['linkedin_url'],
                            'website' => $firmo['website'],
                        ], static fn ($value): bool => filled($value)) : [],
                    ],
                ]);

                $seenHashes[$hash] = true;
                EnrichSocialSignalJob::dispatch($signal->id);
                $created++;
                if ($tier === 'possible') {
                    $possible++;
                }
                if ($isOpportunity) {
                    $opportunities++;
                }
            }

            // A scan the daily limit stopped before it searched anything has not
            // looked at this ICP: leave it due so tomorrow's scheduled scan runs it
            // instead of waiting a full cadence (13 Nov 2026: a new ICP got nothing).
            if (! ($this->budgetExhausted && $this->apiCallsThisRun === 0)) {
                $settings->update(['last_run_at' => now()]);
            }

            $groundingRejectedTotal = array_sum($groundingRejected);

            $run->update([
                'status' => 'completed',
                'signals_created' => $created,
                'result_summary' => [
                    'totalChecked' => $taggedHits->count(),
                    'qualified' => $created - $possible,
                    'possible' => $possible,
                    // Verified company events whose company fits the ICP (the Opportunities list).
                    'opportunities' => $opportunities,
                    'rejected' => [
                        'icpMismatch' => $icpRejected,
                        'missingSourceUrl' => $groundingRejected['missing_source_url'],
                        'missingSourceDate' => $groundingRejected['missing_source_date'],
                        'stale' => $groundingRejected['stale'],
                        'typeMismatch' => $typeMismatch,
                        'belowMinScore' => $belowMinScore,
                        'duplicate' => $duplicate,
                        'notActionable' => $notActionable,
                        'total' => $icpRejected + $groundingRejectedTotal + $belowMinScore + $duplicate + $notActionable + $typeMismatch,
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
     * How far back to look for one event type: its own recency window, never shorter than the
     * scan window and never longer than a year.
     */
    private function eventWindowDays(SignalTypeDefinition $definition, int $scanWindow): int
    {
        return max($scanWindow, min(365, (int) ($definition->default_recency_window_days ?: $scanWindow)));
    }

    /**
     * The same company event (company + signal type) was already saved for this ICP recently.
     */
    private function eventAlreadySaved(int $organizationId, int $icpId, string $companyName, string $signalTypeKey): bool
    {
        return SocialSignal::query()
            ->where('organization_id', $organizationId)
            ->where('icp_profile_id', $icpId)
            ->where('signal_type_key', $signalTypeKey)
            ->whereRaw('LOWER(company_name) = ?', [mb_strtolower($companyName)])
            ->where('created_at', '>=', now()->subDays(self::EVENT_DEDUPE_DAYS))
            ->exists();
    }

    /**
     * The posts that get a model review this run. Company-event posts (news, job boards,
     * typed social posts) are ranked on different cues than first-person asks, so they get a
     * reserved share of the budget instead of losing every slot to social posts.
     *
     * @param  list<array<string, mixed>>  $ranked  Best first.
     * @return list<array<string, mixed>>
     */
    private function withinReviewBudget(array $ranked, int $cap): array
    {
        $events = array_values(array_filter($ranked, static fn (array $entry): bool => ($entry['signalTypeKey'] ?? null) !== null));
        $others = array_values(array_filter($ranked, static fn (array $entry): bool => ($entry['signalTypeKey'] ?? null) === null));
        $eventShare = min(count($events), $this->budget('event_review_share', self::DEFAULT_EVENT_REVIEW_SHARE), $cap);
        $selected = array_merge(array_slice($events, 0, $eventShare), array_slice($others, 0, $cap - $eventShare));
        if (count($selected) < $cap) {
            $selected = array_merge($selected, array_slice($events, $eventShare, $cap - count($selected)));
        }

        return $selected;
    }

    /**
     * Company facts for every company behind a gate-passing signal, in one batch.
     *
     * @param  list<array<string, mixed>>  $candidates
     * @return array<string, array<string, mixed>>
     */
    private function firmographicsFor(array $candidates): array
    {
        $names = [];
        foreach ($candidates as $candidate) {
            $enriched = $candidate['enriched'] ?? [];
            $name = trim((string) ($enriched['company_name'] ?? ''));
            if ($name !== '' && mb_strtolower((string) ($enriched['entity_type'] ?? '')) !== 'individual') {
                $names[$name] = true;
            }
        }
        $names = array_slice(array_keys($names), 0, $this->budget('max_firmographic_lookups_per_run', self::DEFAULT_FIRMOGRAPHIC_LOOKUPS));

        try {
            return app(CompanyFirmographicsResolver::class)->resolveMany($names);
        } catch (\Throwable $e) {
            Log::warning('Company lookup failed', ['error' => $e->getMessage()]);

            return [];
        }
    }

    /**
     * @return Collection<int, SignalTypeDefinition>
     */
    private function activeDefinitions(int $organizationId, IcpBrief $brief, ?ListeningProfile $profile = null): Collection
    {
        $cap = max(0, (int) config('services.social_listening.max_signal_type_queries_per_run', 8));
        if ($cap === 0) {
            return collect();
        }

        // The built-in packs are buyer signals: events that make a company a likely CUSTOMER.
        // When the account needs suppliers, investors or partners they only produce false
        // signals, so the default pack runs for customer needs only. Packs a user picked
        // explicitly are still honoured.
        $explicitPacks = array_values(array_filter(
            $brief->signalTypePacks,
            static fn ($pack): bool => is_string($pack) && $pack !== '' && $pack !== SignalTypeDefinition::PACK_DEFAULT,
        ));
        $packs = $brief->resolvedSignalTypePacks();
        if ($profile !== null && $explicitPacks === []) {
            // No packs chosen: use the events that matter for this kind of need.
            $packs = match ($profile->mode) {
                // Company events (market entry, distributor appointments, leadership hires) are
                // openings both for selling to a company and for partnering/distributing for it.
                'sell', 'partner' => $packs,
                'source' => [SignalTypeDefinition::PACK_SUPPLY],
                'raise' => [SignalTypeDefinition::PACK_FUNDING],
                default => [],
            };
            if ($packs === []) {
                return collect();
            }
        }

        $this->signalTypeRegistry->ensureDefaults();

        return $this->signalTypeRegistry
            ->activeForPacks($organizationId, $packs)
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

        // The same signal types, phrased as company announcements for news and job boards.
        $perType = [];
        foreach ($definitions as $definition) {
            $isHiring = in_array($definition->key, self::HIRING_SIGNAL_KEYS, true);
            $route = $isHiring ? ['job_boards'] : ['news'];
            // Each event type searches its own window (180 days for a market entry), not the
            // scan's 30-day window for social posts.
            $typeTbs = $this->freshness->serperWindow($this->eventWindowDays($definition, $windowDays));
            $english = [];
            foreach ($this->signalQueryBuilder->buildEventQueries($definition, $brief) as $query) {
                $english[] = ['query' => $query, 'native' => $query, 'family' => 'signal_type', 'only_sources' => $route, 'signalTypeKey' => $definition->key, 'tbs' => $typeTbs];
            }
            // The home-market press of where the companies are based, in its own language.
            $local = [];
            foreach ($isHiring ? [] : $this->signalQueryBuilder->buildLocalizedEventQueries($definition, $brief) as $localQuery) {
                $local[] = ['query' => $localQuery['q'], 'native' => $localQuery['q'], 'family' => 'signal_type', 'only_sources' => ['news'], 'signalTypeKey' => $definition->key, 'tbs' => $typeTbs, 'geo' => ['gl' => $localQuery['gl'], 'hl' => $localQuery['hl']]];
            }
            // Alternate English and home-market queries so a capped budget searches both.
            $entries = [];
            for ($i = 0; $i < max(count($english), count($local)); $i++) {
                array_push($entries, ...array_filter([$english[$i] ?? null, $local[$i] ?? null]));
            }
            $perType[] = $entries;
        }
        // Round-robin across types so a capped budget still covers every event type.
        $eventPlan = [];
        for ($round = 0; $perType !== [] && $round < max(array_map('count', $perType)); $round++) {
            foreach ($perType as $entries) {
                if (isset($entries[$round])) {
                    $eventPlan[] = $entries[$round];
                }
            }
        }

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

        $searchPhase = function (array $keys, bool $requireListed, ?array $plan = null, ?int $phaseCap = null) use (
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
            $phaseCalls = 0;
            foreach ($plan ?? $queries as $planned) {
                foreach ($keys as $key) {
                    if ($phaseCap !== null) {
                        // Event phase: its own budget, and it never stops early on survivors.
                        if ($phaseCalls >= $phaseCap) {
                            return;
                        }
                    } elseif ($calls >= $maxCalls || $survivors >= $survivorTarget) {
                        return;
                    }
                    if ($planned['only_sources'] !== null && ! in_array($key, $planned['only_sources'], true)) {
                        continue;
                    }
                    if (in_array($key, self::EVENT_SOURCES, true) && ! in_array($key, (array) $planned['only_sources'], true)) {
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
                    if (app(SocialSourceHealth::class)->isBlocked($key)) {
                        continue;
                    }
                    if (! $this->canSpendCall()) {
                        return;
                    }
                    $this->apiCallsThisRun++;
                    if ($phaseCap !== null) {
                        $phaseCalls++;
                    } else {
                        $calls++;
                    }
                    $query = in_array($key, self::FULL_TEXT_SOURCES, true) ? $planned['native'] : $planned['query'];
                    try {
                        $hits = $source->search($brief, $query, $organization->id, self::RESULTS_PER_QUERY, $planned['tbs'] ?? $tbs, ($planned['geo'] ?? []) + $context)->all();
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

        if ($eventPlan !== []) {
            $searchPhase(self::EVENT_SOURCES, false, $eventPlan, $this->budget('max_event_search_calls_per_run', self::DEFAULT_MAX_EVENT_CALLS));
        }
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

    /**
     * Undated posts that are not Reddit (handled above) and carry no decodable ID get their
     * publish date read from the page itself, so they are qualified instead of dropped.
     *
     * @param  list<array<string, mixed>>  $candidates
     * @return list<array<string, mixed>>
     */
    private function hydratePageDates(array $candidates): array
    {
        $cap = $this->budget('max_page_date_fetches_per_run', self::DEFAULT_PAGE_DATE_CAP);
        $dates = app(LinkedInActivityDateExtractor::class);
        $targets = [];
        foreach ($candidates as $index => $entry) {
            if (count($targets) >= $cap) {
                break;
            }
            /** @var RawSocialHit $hit */
            $hit = $entry['hit'];
            if ($hit->postedAt !== null || ! filled($hit->postUrl) || preg_match('#reddit\.com#i', (string) $hit->postUrl)) {
                continue;
            }
            if ($dates->fromUrl($hit->postUrl) !== null) {
                continue;
            }
            $targets[$index] = $hit;
        }

        if ($targets === []) {
            return $candidates;
        }

        foreach (app(PageDateHydrator::class)->hydrateMany($targets) as $index => $hydrated) {
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
            // The planner's own first-person need phrases and need-specific lanes find openings,
            // not commentary, so they win the qualification budget.
            'pain', 'competitor', 'ask', 'supply', 'funding', 'moment' => 3,
            'community', 'evaluate', 'partnership' => 2,
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
            // The event is about this company, whoever published it (outlet, job board, a person).
            $enriched['entity_type'] = 'company';
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
