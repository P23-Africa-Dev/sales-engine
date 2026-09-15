<?php

namespace App\Services\Intent;

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
use App\Services\SignalDetection\SignalGroundingGate;
use App\Services\SignalDetection\SignalTypeRegistry;
use Illuminate\Support\Collection;

class SocialListeningOrchestrator
{
    /**
     * Social Listening's extraction (SocialSignalEnricher) only ever produces
     * industry/location data — there is no firmographic provider wired in that
     * could supply company size or revenue. Constraining the Stage 1 gate to
     * these fields avoids hard-failing every signal on data this pipeline
     * structurally cannot populate. See IcpFilterService's own docblock.
     */
    private const ICP_FILTER_AVAILABLE_FIELDS = ['industry', 'territory'];

    /** @param  list<SocialSourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly SocialSignalEnricher $enricher,
        private readonly GlmClient $glm,
        private readonly SignalFreshnessScorer $freshness = new SignalFreshnessScorer,
        private readonly IcpFilterService $icpFilter = new IcpFilterService,
        private readonly SignalGroundingGate $groundingGate = new SignalGroundingGate,
        private readonly SignalTypeRegistry $signalTypeRegistry = new SignalTypeRegistry,
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
            // Count social-listening Serper + Meta Graph calls — not discovery/chat/enrichment usage.
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
            $windowDays = max(1, (int) ($settings->freshness_window_days ?? 14));
            $tbs = $this->freshness->serperTbs($windowDays);
            $queries = $this->buildQueries($organization, $icp, $brief);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources']]);

            $context = [
                'meta_page_ids' => array_values(array_filter(
                    array_map('strval', $settings->meta_page_ids ?? []),
                    fn(string $id) => trim($id) !== ''
                )),
            ];

            // Tagged as [hit, signalTypeKey]. General queries (untagged, signalTypeKey null)
            // preserve today's existing behavior for ICPs that haven't opted into any
            // signal-type pack. Signal-type queries (Stage 2) are additional, dedicated
            // searches — one per active discrete signal type, up to the configured cap —
            // so a hit found via one is honestly attributable to that type, with no extra
            // classification LLM call needed.
            $taggedHits = [];
            foreach ($queries as $query) {
                foreach ($this->sources as $source) {
                    if (! $source->isEnabled($brief, $enabled)) {
                        continue;
                    }
                    foreach ($source->search($brief, $query, $organization->id, 6, $tbs, $context) as $hit) {
                        $taggedHits[] = ['hit' => $hit, 'signalTypeKey' => null];
                    }
                }
            }

            $signalTypeQueries = $this->buildSignalTypeQueries($organization->id, $brief);
            foreach ($signalTypeQueries as $signalTypeKey => $query) {
                foreach ($this->sources as $source) {
                    if (! $source->isEnabled($brief, $enabled)) {
                        continue;
                    }
                    foreach ($source->search($brief, $query, $organization->id, 6, $tbs, $context) as $hit) {
                        $taggedHits[] = ['hit' => $hit, 'signalTypeKey' => $signalTypeKey];
                    }
                }
            }

            // Dedupe by hit identity, preferring a signal-type-tagged occurrence over an
            // untagged one when the same post surfaces from both query sets.
            $byHash = [];
            foreach ($taggedHits as $entry) {
                $hash = md5(mb_strtolower($entry['hit']->postUrl ?? $entry['hit']->postText));
                if (! isset($byHash[$hash]) || ($byHash[$hash]['signalTypeKey'] === null && $entry['signalTypeKey'] !== null)) {
                    $byHash[$hash] = $entry;
                }
            }

            $uniqueHits = collect(array_values($byHash))->take(24);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources', 'enriching']]);

            $created = 0;
            $icpRejected = 0;
            $groundingRejected = ['missing_source_url' => 0, 'missing_source_date' => 0, 'stale' => 0];
            foreach ($uniqueHits as $entry) {
                /** @var RawSocialHit $hit */
                $hit = $entry['hit'];
                $signalTypeKey = $entry['signalTypeKey'];
                $postedAt = $hit->postedAt;
                if ($postedAt === null && $hit->postUrl) {
                    $postedAt = app(\App\Services\Intent\LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
                }

                // Stage 2 mandatory-grounding gate (new_plan.md): no source URL or no
                // publish date means the hit is discarded outright — never surfaced
                // with a lower score. See SignalGroundingGate's docblock.
                $gate = $this->groundingGate->admit($hit->postUrl, $postedAt, $windowDays);
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

                $signalTypeDefinition = $signalTypeKey !== null
                    ? $this->signalTypeRegistry->find($organization->id, $signalTypeKey)
                    : null;
                $enriched = $this->enricher->enrich($organization, $icp, $hit, $signalTypeDefinition);
                $relevance = (float) ($enriched['score'] ?? 0);
                $score = $this->freshness->apply($relevance, $postedAt, $windowDays);
                $enriched['score'] = $score;
                $enriched['urgency'] = $this->freshness->nudgeUrgency(
                    isset($enriched['urgency']) ? (string) $enriched['urgency'] : null,
                    $postedAt,
                );

                // Stage 1 hard gate: Social Listening is always ICP-driven (there is no
                // live chat query behind an automatic scan), so a candidate that fails
                // the structured ICP checklist is discarded here — never surfaced with
                // a caveat. See IcpFilterService and docs/backend_implementation_plan.md.
                //
                // `icp_filter_enabled` is an operational kill switch (Phase 8), not a
                // product toggle — when off, no field is evaluated (availableFields: [])
                // so the result always passes, and icp_filter_reasons honestly reflects
                // "not evaluated" rather than fabricating a real pass.
                $icpFilterResult = $this->icpFilter->passes(
                    $brief,
                    new CandidateCompany(
                        industry: trim((string) ($enriched['industry'] ?? '')) ?: null,
                        territory: trim((string) ($enriched['location_text'] ?? '')) ?: null,
                    ),
                    $settings->icp_filter_enabled ? self::ICP_FILTER_AVAILABLE_FIELDS : [],
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
                    'territory' => $this->clip((string) ($enriched['location_text'] ?? ''), 255),
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
                    'meta' => [
                        'title' => $hit->title,
                        'snippet' => $hit->snippet,
                        'date_raw' => $hit->dateRaw,
                        'author_name' => $hit->authorName,
                        'author_profile_url' => $hit->authorProfileUrl,
                        'relevance_score' => $relevance,
                        'freshness_factor' => $this->freshness->factor($postedAt, $windowDays),
                    ],
                ]);

                $created++;
            }

            $settings->update(['last_run_at' => now()]);

            $groundingRejectedTotal = array_sum($groundingRejected);

            // Structured run summary (Phase 6): lets the frontend show a real
            // "we checked N, rejected N for X, kept N" breakdown instead of
            // parsing a sentence. See docs/backend_implementation_plan.md.
            $run->update([
                'status' => 'completed',
                'signals_created' => $created,
                'result_summary' => [
                    'totalChecked' => $uniqueHits->count(),
                    'qualified' => $created,
                    'rejected' => [
                        'icpMismatch' => $icpRejected,
                        'missingSourceUrl' => $groundingRejected['missing_source_url'],
                        'missingSourceDate' => $groundingRejected['missing_source_date'],
                        'stale' => $groundingRejected['stale'],
                        'total' => $icpRejected + $groundingRejectedTotal,
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
     * Stage 2 discrete signal-type queries (new_plan.md): one dedicated, deterministic
     * search per active signal type, instead of relying on the general-purpose query
     * set (buildQueries()) and a generic classifier to sort hits into buckets after
     * the fact. Deterministic (no LLM call) to avoid adding cost/latency/prompt risk
     * on top of the existing, separately-tuned general query generation — trigger
     * wording quality can be improved later without changing this method's contract.
     *
     * @return array<string, string>  signal type key => query string
     */
    private function buildSignalTypeQueries(int $organizationId, IcpBrief $brief): array
    {
        // Strictly opt-in: an ICP that hasn't chosen a signal-type pack gets zero
        // extra queries and zero extra API cost — SignalTypeRegistry's own
        // "empty packs falls back to the default pack" behavior is the right
        // contract for callers that WANT a pack, but this feature must not
        // silently turn on (and start spending API budget) for every existing
        // ICP the moment this ships.
        if ($brief->signalTypePacks === []) {
            return [];
        }

        $cap = max(0, (int) config('services.social_listening.max_signal_type_queries_per_run', 4));
        if ($cap === 0) {
            return [];
        }

        $definitions = $this->signalTypeRegistry->activeForPacks($organizationId, $brief->signalTypePacks)->take($cap);

        $recencyPhrase = 'past week OR latest OR just announced OR this month';
        $territoryHint = implode(' ', array_slice($brief->territories, 0, 2));

        $queries = [];
        foreach ($definitions as $definition) {
            $parts = array_filter([$definition->label, $territoryHint, $recencyPhrase]);
            $queries[$definition->key] = trim(implode(' ', $parts));
        }

        return $queries;
    }

    /**
     * @return list<string>
     */
    /**
     * Stage 1/Stage 2 separation (new_plan.md): industries/territories/decisionMakers
     * are structured ICP FILTER fields, never search-query fuel — a signal is
     * detected first (broadly, on interest language), then Stage 1's
     * IcpFilterService discards it if it doesn't match those structured fields.
     * Only customPrompt/description (freeform interest statements) seed query
     * generation here. This intentionally trades some recall for orgs that
     * haven't written a customPrompt (their fallback query is generic) in
     * exchange for actually honoring the spec's core rule — see
     * docs/backend_implementation_plan.md Phase 2.4 and the "Query fix scope"
     * decision recorded there.
     *
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

        $parts = array_filter([
            $interestPhrase,
            'past week OR latest OR just announced',
        ]);

        return [trim(implode(' ', $parts))];
    }

    /**
     * @param  array<string, mixed>  $enriched
     * @param  list<string>  $filters
     */
    private function matchesIntentFilters(array $enriched, array $filters): bool
    {
        // Empty filters = allow all non-spam relevant types; `other` is still gated by min_score
        // (SocialSignalEnricher caps its score low), so it isn't blindly discarded here.
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
                if ($needle !== '' && str_contains($signalType, $needle)) {
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
