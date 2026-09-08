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
        private readonly SignalFreshnessScorer $freshness = new SignalFreshnessScorer,
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

            $hits = collect();
            foreach ($queries as $query) {
                foreach ($this->sources as $source) {
                    if (! $source->isEnabled($brief, $enabled)) {
                        continue;
                    }
                    $hits = $hits->merge($source->search($brief, $query, $organization->id, 6, $tbs, $context));
                }
            }

            $uniqueHits = $hits
                ->unique(fn(RawSocialHit $h) => md5(mb_strtolower($h->postUrl ?? $h->postText)))
                ->take(24);

            $run->update(['stages' => ['analyzing_icp', 'searching_sources', 'enriching']]);

            $created = 0;
            /** @var RawSocialHit $hit */
            foreach ($uniqueHits as $hit) {
                $postedAt = $hit->postedAt;
                if ($postedAt === null && $hit->postUrl) {
                    $postedAt = app(\App\Services\Intent\LinkedInActivityDateExtractor::class)->fromUrl($hit->postUrl);
                }

                // Hard freshness gate: known dates older than the window never become signals.
                if ($this->freshness->isStale($postedAt, $windowDays)) {
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

                $enriched = $this->enricher->enrich($organization, $icp, $hit);
                $relevance = (float) ($enriched['score'] ?? 0);
                $score = $this->freshness->apply($relevance, $postedAt, $windowDays);
                $enriched['score'] = $score;
                $enriched['urgency'] = $this->freshness->nudgeUrgency(
                    isset($enriched['urgency']) ? (string) $enriched['urgency'] : null,
                    $postedAt,
                );

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
                    'persona' => $this->clip((string) ($enriched['persona'] ?? ''), 255),
                    'company_name' => $this->clip((string) ($enriched['company_name'] ?? ''), 255),
                    'entity_type' => $this->clip((string) ($enriched['entity_type'] ?? ''), 16),
                    'industry' => $this->clip((string) ($enriched['industry'] ?? ''), 255),
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
                        'relevance_score' => $relevance,
                        'freshness_factor' => $this->freshness->factor($postedAt, $windowDays),
                    ],
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
                        'content' => 'Generate 3-5 short Google search queries to find FRESH social/web posts that are genuine opportunities for a specific user, grounded in their ICP and stated interests (custom_prompt/description). '
                            . 'Prefer timely language: "past week", "this week", "latest", "just announced", "recent", current year. '
                            . 'Buying-intent phrasing ("looking for", "recommend", "alternative to", "switching from", "how much", "vendor") is ONE valid angle WHEN it matches the user\'s interests — but it is not the only one. '
                            . 'Also generate queries for funding/investment news, market moves, partnerships, competitive moves, and regulatory changes WHEN the custom_prompt/description implies the user cares about those (e.g. investing, market research, deal sourcing). '
                            . 'Do not blanket-exclude thought-leadership or news-style content — only avoid it when it is clearly irrelevant to the stated interests. '
                            . 'Weight custom_prompt heavily: it is the clearest statement of what this user actually wants. '
                            . 'Prioritize opportunities that would still be actionable now — not historical roundups from months/years ago. '
                            . 'IMPORTANT: Do NOT generate recruiting/job-board queries (hiring, "we\'re hiring", job openings) unless custom_prompt explicitly asks for hiring/talent signals. Decision-maker titles (e.g. Head of Sales) describe WHO the user sells to or watches — they are not a request for job ads. '
                            . 'Return JSON: {"queries":["..."]}',
                    ],
                    [
                        'role' => 'user',
                        'content' => json_encode([
                            'industries' => array_values(array_filter($brief->industries, fn($i) => is_string($i) && mb_strlen(trim($i)) >= 3 && ! in_array(mb_strtolower(trim($i)), ['yes', 'no', 'n/a'], true))),
                            'territories' => $brief->territories,
                            'decision_makers' => $brief->decisionMakers,
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
            : 'looking for recommendations OR switching OR pricing';

        $parts = array_filter([
            implode(' ', array_slice($brief->industries, 0, 1)),
            implode(' ', array_slice($brief->territories, 0, 1)),
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
