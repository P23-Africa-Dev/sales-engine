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
use App\Services\Extraction\ExtractionService;
use App\Services\Scoring\ScoringService;
use Illuminate\Support\Collection;

class DiscoveryOrchestrator
{
    /** @param  list<DiscoverySourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly CompanyCacheService $cache,
        private readonly ExtractionService $extraction,
        private readonly ScoringService $scoring,
        private readonly QueryIntentService $queryIntent,
    ) {}

    /**
     * @return array{run: DiscoveryRun, leads: list<array<string, mixed>>, companies: Collection}
     */
    public function run(
        Organization $organization,
        IcpProfile $icp,
        ?User $user = null,
        string $query = '',
        string $intent = 'generate_leads',
        ?int $chatSessionId = null,
        int $limit = 8,
        ?DiscoveryRun $existingRun = null,
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
            $brief = IcpBrief::fromIcpProfile($icp, $query);
            $effectiveLimit = min(12, max(1, $limit > 0 ? $limit : $brief->requestedLimit));
            $ctx = new SearchContext($organization->id, $user?->id, $effectiveLimit, $intent);

            $this->updateProgress($run, 1, 0, 0);

            $this->appendStage($run, 'searching_sources');

            $sourcesChecked = 0;
            $hits = collect();
            foreach ($this->sources as $source) {
                if (! $source->isEnabled()) {
                    continue;
                }
                $sourcesChecked++;
                $hits = $hits->merge($source->search($brief, $ctx));
            }

            $this->updateProgress($run, 2, $sourcesChecked, 0);

            $this->appendStage($run, 'extracting');
            $leadsPayload = [];
            $companies = collect();
            $candidatesFound = 0;

            /** @var RawDiscoveryHit $hit */
            foreach ($hits->unique(fn (RawDiscoveryHit $h) => mb_strtolower($h->name))->take($effectiveLimit) as $hit) {
                $extracted = $this->extraction->extract($hit, $brief, $organization);
                $displayName = trim((string) ($extracted['person_name'] ?? $extracted['name'] ?? $hit->name));

                if ($displayName === '' || mb_strtolower($displayName) === mb_strtolower($brief->name)) {
                    continue;
                }

                if ($this->queryIntent->looksLikeArticleTitle($displayName)) {
                    continue;
                }

                $scores = $this->scoring->score(array_merge($extracted, [
                    'name' => $displayName,
                    'source' => $hit->source,
                    'provider' => $hit->provider,
                ]), $brief, $organization);

                $scores = $this->applyScorePenalties($scores, $displayName, $brief, $extracted);

                if ($intent === 'generate_leads' && $scores['priority_score'] < $brief->minMatchScore) {
                    continue;
                }

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

                LeadSignal::query()->create([
                    'organization_id' => $organization->id,
                    'company_id' => $company->id,
                    'signal_type' => 'discovery',
                    'confidence' => $scores['icp_fit_score'] / 100,
                    'score' => $scores['priority_score'],
                    'source' => $hit->provider,
                    'url' => $hit->url,
                    'snippet' => $hit->snippet,
                    'detected_at' => now(),
                ]);

                $lead = Lead::query()->create([
                    'organization_id' => $organization->id,
                    'company_id' => $company->id,
                    'icp_profile_id' => $icp->id,
                    'name' => $displayName,
                    'source' => $hit->provider,
                    'score' => $scores['priority_score'],
                    'summary' => $extracted['summary'] ?? $company->summary ?? $scores['rationale'],
                    'stage' => 'new',
                    'save_status' => Lead::SAVE_DRAFT,
                    'meta' => [
                        'rationale' => $scores['rationale'],
                        'low_confidence' => (bool) ($extracted['low_confidence'] ?? false),
                        'title' => $extracted['title'] ?? null,
                        'company' => $extracted['company'] ?? null,
                        'linkedin_url' => $extracted['linkedin_url'] ?? $hit->url,
                    ],
                ]);

                $companies->push($company);
                $leadsPayload[] = [
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'source' => $lead->source,
                    'score' => (int) round((float) $lead->score),
                    'summary' => $lead->summary,
                    'save_status' => $lead->save_status,
                    'crm_synced' => filled($lead->synced_to_f23_at),
                    'f23_lead_id' => $lead->f23_lead_id,
                    'low_confidence' => (bool) ($extracted['low_confidence'] ?? false),
                ];

                $candidatesFound++;
                $this->updateProgress($run, 3, $sourcesChecked, $candidatesFound);
            }

            $this->appendStage($run, 'compiling_results');
            $this->updateProgress($run, 4, $sourcesChecked, $candidatesFound);

            $icp->lead_count = Lead::query()
                ->where('organization_id', $organization->id)
                ->where('icp_profile_id', $icp->id)
                ->count();
            $icp->save();

            $run->update([
                'status' => 'completed',
                'result_summary' => [
                    'lead_count' => count($leadsPayload),
                    'sources_enabled' => collect($this->sources)->filter->isEnabled()->map->key()->values()->all(),
                ],
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
        }
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
     * @param  array{icp_fit_score: float, intent_score: float, priority_score: float, rationale: string}  $scores
     * @param  array<string, mixed>  $extracted
     * @return array{icp_fit_score: float, intent_score: float, priority_score: float, rationale: string}
     */
    private function applyScorePenalties(array $scores, string $displayName, IcpBrief $brief, array $extracted): array
    {
        if (mb_strtolower($displayName) === mb_strtolower($brief->name)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - 40);
            $scores['rationale'] .= ' Penalized: name matched ICP profile.';
        }

        if ($this->queryIntent->looksLikeArticleTitle($displayName)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - 35);
            $scores['rationale'] .= ' Penalized: looks like article content.';
        }

        if ((bool) ($extracted['low_confidence'] ?? false)) {
            $scores['priority_score'] = max(0, $scores['priority_score'] - 15);
            $scores['rationale'] .= ' Lower confidence extraction.';
        }

        return $scores;
    }
}
