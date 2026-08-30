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
    ): array {
        $run = DiscoveryRun::query()->create([
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

        try {
            $brief = IcpBrief::fromIcpProfile($icp, $query);
            $ctx = new SearchContext($organization->id, $user?->id, $limit, $intent);

            $this->appendStage($run, 'searching_sources');

            $hits = collect();
            foreach ($this->sources as $source) {
                if (! $source->isEnabled()) {
                    continue;
                }
                $hits = $hits->merge($source->search($brief, $ctx));
            }

            $this->appendStage($run, 'extracting');
            $leadsPayload = [];
            $companies = collect();

            /** @var RawDiscoveryHit $hit */
            foreach ($hits->unique(fn (RawDiscoveryHit $h) => mb_strtolower($h->name))->take($limit) as $hit) {
                $extracted = $this->extraction->extract($hit, $brief, $organization);
                $scores = $this->scoring->score(array_merge($extracted, [
                    'name' => $hit->name,
                    'source' => $hit->source,
                    'provider' => $hit->provider,
                ]), $brief, $organization);

                $company = $this->cache->upsertFromHit($organization, $hit, [
                    'name' => $extracted['name'] ?? $hit->name,
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
                    'name' => $company->name,
                    'source' => $hit->provider,
                    'score' => $scores['priority_score'],
                    'summary' => $company->summary ?? $scores['rationale'],
                    'stage' => 'new',
                    'meta' => ['rationale' => $scores['rationale']],
                ]);

                if ($brief->autoSyncCrm && $scores['priority_score'] >= $brief->minMatchScore) {
                    // Already in SE CRM as stage=new; optional F23 push is separate.
                }

                $companies->push($company);
                $leadsPayload[] = [
                    'id' => $lead->id,
                    'name' => $lead->name,
                    'source' => $lead->source,
                    'score' => (int) round((float) $lead->score),
                    'summary' => $lead->summary,
                ];
            }

            $this->appendStage($run, 'compiling_results');

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
            ->map(fn (DiscoverySourceInterface $s) => [
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
}
