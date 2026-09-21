<?php

namespace App\Services\Research;

use App\Models\DiscoveryRun;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\User;
use App\Services\Discovery\Adapters\SerperDiscoveryAdapter;
use App\Services\Discovery\Contracts\DiscoverySourceInterface;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\DTO\SearchContext;
use App\Services\Llm\GlmClient;

class ResearchOrchestrator
{
    public const SOFT_DEADLINE_SECONDS = 20;

    public const HARD_DEADLINE_SECONDS = 45;

    public const MAX_SUB_QUERIES = 3;

    public const DECOMPOSE_TIMEOUT_SECONDS = 8;

    public const SYNTHESIZE_TIMEOUT_SECONDS = 12;

    private float $startedAt = 0;

    private float $deadlineAt = 0;

    /** @param  list<DiscoverySourceInterface>  $sources */
    public function __construct(
        private readonly array $sources,
        private readonly GlmClient $glm,
        private readonly \App\Services\Chat\IcpChatContextBuilder $icpChatContext,
    ) {}

    /**
     * @param  list<array{role: string, content: string}>  $historySlice
     * @return array{run: DiscoveryRun, narrative: string, research: array{sub_queries: list<string>, sources: list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>}}
     */
    public function run(
        Organization $organization,
        IcpProfile $icp,
        ?User $user,
        string $query,
        ?int $chatSessionId = null,
        ?DiscoveryRun $existingRun = null,
        array $historySlice = [],
    ): array {
        $this->startedAt = microtime(true);
        $this->deadlineAt = $this->startedAt + self::HARD_DEADLINE_SECONDS;

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
                'error' => null,
            ]);
        }

        try {
            $subQueries = $this->decomposeQueries($organization, $icp, $query);
            $this->appendStage($run, 'searching_sources');
            $this->updateProgress($run, 2, 0, 0);

            [$sources, $sourcesChecked] = $this->fetchSourcesParallel(
                $organization,
                $icp,
                $user,
                $subQueries,
            );

            // Persist sources immediately so timeouts can recover a useful brief.
            $this->persistPartialSources($run, $subQueries, $sources, $sourcesChecked);
            $this->updateProgress($run, 2, $sourcesChecked, count($sources));

            $this->appendStage($run, 'synthesizing');
            $this->updateProgress($run, 3, $sourcesChecked, count($sources));

            $softCompleted = false;
            if ($this->pastSoftDeadline() || $this->pastHardDeadline()) {
                $narrative = $this->deterministicNarrative($query, $icp, $sources);
                $softCompleted = true;
            } else {
                $synthesized = $this->synthesize(
                    $organization,
                    $icp,
                    $query,
                    $subQueries,
                    $sources,
                    $historySlice,
                );
                $narrative = $synthesized['narrative'];
                $sources = $synthesized['sources'];
            }

            $this->appendStage($run, 'compiling_results');
            $this->updateProgress($run, 4, $sourcesChecked, count($sources));

            $run->update([
                'status' => 'completed',
                'error' => null,
                'result_summary' => array_merge(
                    is_array($run->result_summary) ? $run->result_summary : [],
                    [
                        'sub_query_count' => count($subQueries),
                        'source_count' => count($sources),
                        'sources' => $sources,
                        'sub_queries' => $subQueries,
                        'sources_enabled' => collect($this->sources)->filter->isEnabled()->map->key()->values()->all(),
                        'soft_completed_early' => $softCompleted,
                        'elapsed_seconds' => round(microtime(true) - $this->startedAt, 1),
                    ]
                ),
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
     * Build a brief from already-persisted sources (used by job timeout recovery).
     *
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>  $sources
     */
    public static function formatRecoveredResearchBrief(string $query, array $sources): string
    {
        $count = count($sources);
        $lines = [
            "## Research brief (partial)",
            '',
            "Found {$count} source" . ($count === 1 ? '' : 's') . " for \"{$query}\" before the research window closed.",
            '',
            '### Sources',
        ];

        foreach (array_slice($sources, 0, 12) as $index => $source) {
            $n = $index + 1;
            $title = trim((string) ($source['title'] ?? 'Untitled'));
            $url = trim((string) ($source['url'] ?? ''));
            $snippet = trim((string) ($source['snippet'] ?? ''));
            $link = $url !== '' ? "[{$title}]({$url})" : $title;
            $lines[] = "{$n}. {$link}" . ($snippet !== '' ? ". {$snippet}" : '');
        }

        $lines[] = '';
        $lines[] = '_Try again for a fuller synthesized brief, or open the sources above._';

        return implode("\n", $lines);
    }

    /**
     * @return list<string>
     */
    private function decomposeQueries(Organization $organization, IcpProfile $icp, string $query): array
    {
        $fallback = $this->heuristicSubQueries($query);

        if (! $this->glm->isConfigured() || $this->pastSoftDeadline()) {
            return $fallback;
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Decompose a B2B research question into 1-3 focused web-search queries covering market context, competitors/signals, and geography for the active ICP. Keep each query short and searchable. Return JSON: {"sub_queries":["..."]}.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                        'query' => $query,
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'chat', $organization, [
                'timeout' => self::DECOMPOSE_TIMEOUT_SECONDS,
                'max_tokens' => 400,
            ]);

            $subs = $result['sub_queries'] ?? [];
            if (is_array($subs) && count($subs) > 0) {
                $filtered = array_values(array_filter($subs, fn($q) => is_string($q) && trim($q) !== ''));

                return array_slice($filtered, 0, self::MAX_SUB_QUERIES) ?: $fallback;
            }
        } catch (\Throwable) {
            // fall through to heuristic
        }

        return $fallback;
    }

    /**
     * @return list<string>
     */
    private function heuristicSubQueries(string $query): array
    {
        $trimmed = trim($query);
        if ($trimmed === '') {
            return [$query];
        }

        $parts = preg_split('/\s+(?:and|vs\.?|versus|compared to)\s+/iu', $trimmed) ?: [];
        $parts = array_values(array_filter(array_map('trim', $parts), fn(string $p) => $p !== ''));

        if (count($parts) >= 2) {
            return array_slice($parts, 0, self::MAX_SUB_QUERIES);
        }

        return [$trimmed];
    }

    /**
     * Parallel Serper fan-out across all sub-queries; stubs remain free no-ops.
     *
     * @param  list<string>  $subQueries
     * @return array{0: list<array{title: string, url: ?string, snippet: ?string, provider: ?string}>, 1: int}
     */
    private function fetchSourcesParallel(
        Organization $organization,
        IcpProfile $icp,
        ?User $user,
        array $subQueries,
    ): array {
        $hits = collect();
        $sourcesChecked = 0;
        $ctx = new SearchContext($organization->id, $user?->id, 5, 'quick_research');
        // Research wants articles/reports as sources — never apply people-lead name gates.
        $primaryBrief = IcpBrief::fromIcpProfile($icp, $subQueries[0] ?? '')
            ->withTarget(\App\Services\Discovery\QueryIntentService::TARGET_COMPANIES);

        foreach ($this->sources as $source) {
            if (! $source->isEnabled()) {
                continue;
            }
            $sourcesChecked++;

            if ($source instanceof SerperDiscoveryAdapter) {
                $hits = $hits->merge($source->searchMany($subQueries, $primaryBrief, $ctx));

                continue;
            }

            // Future real adapters: still fan out per sub-query without nesting Serper sequentially.
            foreach ($subQueries as $subQuery) {
                $brief = IcpBrief::fromIcpProfile($icp, $subQuery);
                $hits = $hits->merge($source->search($brief, $ctx));
            }
        }

        $sources = [];
        /** @var RawDiscoveryHit $hit */
        foreach ($hits->unique(fn(RawDiscoveryHit $h) => mb_strtolower($h->url ?? $h->name))->take(20) as $hit) {
            $sources[] = [
                'title' => $hit->name,
                'url' => $hit->url,
                'snippet' => $hit->snippet,
                'provider' => $hit->provider,
            ];
        }

        return [$sources, $sourcesChecked];
    }

    /**
     * @param  list<string>  $subQueries
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: ?string}>  $sources
     */
    private function persistPartialSources(
        DiscoveryRun $run,
        array $subQueries,
        array $sources,
        int $sourcesChecked,
    ): void {
        $summary = is_array($run->result_summary) ? $run->result_summary : [];
        $summary['sources'] = $sources;
        $summary['sub_queries'] = $subQueries;
        $summary['source_count'] = count($sources);
        $summary['sub_query_count'] = count($subQueries);
        $summary['progress'] = array_merge($summary['progress'] ?? [], [
            'step' => 2,
            'total_steps' => 4,
            'sources_checked' => $sourcesChecked,
            'candidates_found' => count($sources),
        ]);
        $run->update(['result_summary' => $summary]);
        $run->refresh();
    }

    /**
     * Single GLM call: narrative with inline [1]/[2] citations + per-source relevance.
     *
     * @param  list<string>  $subQueries
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: ?string}>  $sources
     * @param  list<array{role: string, content: string}>  $historySlice
     * @return array{narrative: string, sources: list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>}
     */
    private function synthesize(
        Organization $organization,
        IcpProfile $icp,
        string $query,
        array $subQueries,
        array $sources,
        array $historySlice = [],
    ): array {
        if (! $this->glm->isConfigured() || $sources === []) {
            return [
                'narrative' => $this->deterministicNarrative($query, $icp, $sources),
                'sources' => $sources,
            ];
        }

        $indexedSources = array_map(
            fn(array $source, int $index) => [
                'index' => $index + 1,
                'title' => $source['title'],
                'snippet' => $source['snippet'],
                'url' => $source['url'],
            ],
            array_slice($sources, 0, 15),
            array_keys(array_slice($sources, 0, 15)),
        );

        try {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'You are Sales Engine. Write a concise research brief for a B2B sales team. '
                        . 'Return JSON only: {"narrative":"markdown string","reasons":[{"index":1,"icp_relevance_reason":"..."}]}. '
                        . 'Narrative structure: Executive Summary, Key Findings, Risks/Opportunities, Recommended Next Steps. '
                        . 'Use markdown. Cite sources with inline markers like [1], [2] matching the 1-based source indexes provided. '
                        . 'Ground findings in the active ICP (industries, territories, buyers). '
                        . 'For each Key Finding, end with an ICP-relevance clause. '
                        . 'Do not invent sources — only reference provided snippets. '
                        . 'reasons[].index is 1-based and must match the sources array. '
                        . 'When prior chat turns are provided, keep continuity.',
                ],
            ];

            foreach (array_slice($historySlice, -4) as $turn) {
                if (($turn['role'] ?? '') === 'user' || ($turn['role'] ?? '') === 'assistant') {
                    $messages[] = ['role' => $turn['role'], 'content' => (string) ($turn['content'] ?? '')];
                }
            }

            $messages[] = [
                'role' => 'user',
                'content' => json_encode([
                    'active_icp' => $this->icpChatContext->toPromptPayload($icp),
                    'query' => $query,
                    'sub_queries' => $subQueries,
                    'sources' => $indexedSources,
                ], JSON_UNESCAPED_UNICODE),
            ];

            $result = $this->glm->chatJson($messages, 'chat', $organization, [
                'timeout' => self::SYNTHESIZE_TIMEOUT_SECONDS,
                'max_tokens' => 2200,
            ]);

            $narrative = trim((string) ($result['narrative'] ?? ''));
            if ($narrative === '') {
                return [
                    'narrative' => $this->deterministicNarrative($query, $icp, $sources),
                    'sources' => $sources,
                ];
            }

            $reasons = $result['reasons'] ?? [];
            if (is_array($reasons)) {
                foreach ($reasons as $row) {
                    if (! is_array($row)) {
                        continue;
                    }
                    // Accept 1-based (preferred) or legacy 0-based indexes.
                    $rawIndex = (int) ($row['index'] ?? -1);
                    $index = $rawIndex >= 1 ? $rawIndex - 1 : $rawIndex;
                    $reason = trim((string) ($row['icp_relevance_reason'] ?? ''));
                    if ($index < 0 || $index >= count($sources) || $reason === '') {
                        continue;
                    }
                    $sources[$index]['icp_relevance_reason'] = $reason;
                }
            }

            return ['narrative' => $narrative, 'sources' => $sources];
        } catch (\Throwable) {
            return [
                'narrative' => $this->deterministicNarrative($query, $icp, $sources),
                'sources' => $sources,
            ];
        }
    }

    /**
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: ?string, icp_relevance_reason?: string}>  $sources
     */
    private function deterministicNarrative(string $query, IcpProfile $icp, array $sources): string
    {
        $count = count($sources);
        $lines = [
            '## Executive Summary',
            '',
            "Quick scan for \"{$query}\" against **{$icp->name}**. Found {$count} public source" . ($count === 1 ? '' : 's') . '.',
            '',
            '### Key Findings',
        ];

        if ($sources === []) {
            $lines[] = '- No public sources returned for this query. Try a more specific industry, geography, or competitor name.';
        } else {
            foreach (array_slice($sources, 0, 8) as $index => $source) {
                $n = $index + 1;
                $title = trim((string) ($source['title'] ?? 'Untitled'));
                $snippet = trim((string) ($source['snippet'] ?? ''));
                $lines[] = "- [{$n}] **{$title}**" . ($snippet !== '' ? ". {$snippet}" : '');
            }
        }

        $lines[] = '';
        $lines[] = '### Recommended Next Steps';
        $lines[] = '- Open the cited sources below for primary detail.';
        $lines[] = '- Ask a follow-up Quick Research question to go deeper on one finding.';
        $lines[] = '- Switch to Generate Leads if you want matching prospects for this market.';

        return implode("\n", $lines);
    }

    private function pastSoftDeadline(): bool
    {
        return $this->startedAt > 0 && (microtime(true) - $this->startedAt) >= self::SOFT_DEADLINE_SECONDS;
    }

    private function pastHardDeadline(): bool
    {
        return $this->deadlineAt > 0 && microtime(true) >= $this->deadlineAt;
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
