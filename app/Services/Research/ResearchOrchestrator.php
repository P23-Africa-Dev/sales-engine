<?php

namespace App\Services\Research;

use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Collection;

class ResearchOrchestrator
{
    /** @param  list<DiscoverySourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly GlmClient $glm,
        private readonly \App\Services\Chat\IcpChatContextBuilder $icpChatContext,
    ) {}

    /**
     * @return array{run: DiscoveryRun, narrative: string, research: array{sub_queries: list<string>, sources: list<array{title: string, url: ?string, snippet: ?string, provider: ?string}>}}
     */
    public function run(
        Organization $organization,
        IcpProfile $icp,
        ?User $user,
        string $query,
        ?int $chatSessionId = null,
        ?DiscoveryRun $existingRun = null,
    ): array {
        $run = $existingRun ?? DiscoveryRun::query()->create([
            'organization_id' => $organization->id,
            'user_id' => $user?->id,
            'icp_profile_id' => $icp->id,
            'chat_session_id' => $chatSessionId,
            'status' => 'running',
            'query' => $query,
            'intent' => 'quick_research',
            'stages' => ['analyzing_brief'],
            'started_at' => now(),
        ]);

        if ($existingRun) {
            $run->update([
                'status' => 'running',
                'query' => $query,
                'intent' => 'quick_research',
                'stages' => ['analyzing_brief'],
                'started_at' => now(),
            ]);
        }

        try {
            $subQueries = $this->decomposeQueries($organization, $icp, $query);
            $this->appendStage($run, 'searching_sources');
            $this->updateProgress($run, 2, 0, 0);

            $sources = [];
            $hits = collect();
            $sourcesChecked = 0;

            foreach ($subQueries as $subQuery) {
                $brief = IcpBrief::fromIcpProfile($icp, $subQuery);
                $ctx = new SearchContext($organization->id, $user?->id, 5, 'quick_research');

                foreach ($this->sources as $source) {
                    if (! $source->isEnabled()) {
                        continue;
                    }
                    $sourcesChecked++;
                    $hits = $hits->merge($source->search($brief, $ctx));
                }
            }

            $this->updateProgress($run, 2, $sourcesChecked, 0);

            /** @var RawDiscoveryHit $hit */
            foreach ($hits->unique(fn(RawDiscoveryHit $h) => mb_strtolower($h->url ?? $h->name))->take(20) as $hit) {
                $sources[] = [
                    'title' => $hit->name,
                    'url' => $hit->url,
                    'snippet' => $hit->snippet,
                    'provider' => $hit->provider,
                ];
            }

            $this->appendStage($run, 'synthesizing');
            $this->updateProgress($run, 3, $sourcesChecked, count($sources));
            $narrative = $this->synthesize($organization, $icp, $query, $subQueries, $sources);

            $this->appendStage($run, 'compiling_results');
            $this->updateProgress($run, 4, $sourcesChecked, count($sources));

            $run->update([
                'status' => 'completed',
                'result_summary' => [
                    'sub_query_count' => count($subQueries),
                    'source_count' => count($sources),
                    'sources_enabled' => collect($this->sources)->filter->isEnabled()->map->key()->values()->all(),
                ],
                'finished_at' => now(),
            ]);

            return [
                'run' => $run->fresh(),
                'narrative' => $narrative,
                'research' => [
                    'sub_queries' => $subQueries,
                    'sources' => $sources,
                ],
            ];
        } catch (\Throwable $e) {
            $run->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
                'finished_at' => now(),
            ]);
            throw $e;
        }
    }

    /**
     * @return list<string>
     */
    private function decomposeQueries(Organization $organization, IcpProfile $icp, string $query): array
    {
        if (! $this->glm->isConfigured()) {
            return [$query];
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Decompose a B2B research question into 2-4 focused sub-questions covering market context, competitors, signals, and geography for the active ICP. Return JSON: {"sub_queries":["..."]}.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                        'query' => $query,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'chat', $organization);

            $subs = $result['sub_queries'] ?? [];
            if (is_array($subs) && count($subs) > 0) {
                $filtered = array_values(array_filter($subs, fn($q) => is_string($q) && trim($q) !== ''));

                return array_slice($filtered, 0, 4) ?: [$query];
            }
        } catch (\Throwable) {
            // fall through to single-query research
        }

        return [$query];
    }

    /**
     * @param  list<string>  $subQueries
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: ?string}>  $sources
     */
    private function synthesize(
        Organization $organization,
        IcpProfile $icp,
        string $query,
        array $subQueries,
        array $sources,
    ): string {
        if (! $this->glm->isConfigured()) {
            $count = count($sources);

            return "Research brief for \"{$query}\" (ICP: {$icp->name}). Found {$count} external sources. Configure GLM_API_KEY for full synthesis.";
        }

        try {
            return $this->glm->chat([
                [
                    'role' => 'system',
                    'content' => 'You are Sales Engine. Write a concise research brief for a B2B sales team. Structure: Executive Summary, Key Findings, Risks/Opportunities, Recommended Next Steps. Ground findings in the active ICP (industries, territories, buyers). End Recommended Next Steps with ICP-aligned actions and one-line reasons. Use markdown. Do not invent sources — only reference provided source snippets.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                        'query' => $query,
                        'sub_queries' => $subQueries,
                        'sources' => array_slice($sources, 0, 15),
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'chat', $organization);
        } catch (\Throwable) {
            return "Research completed for \"{$query}\" with " . count($sources) . ' sources. Review the source list below for details.';
        }
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
}
