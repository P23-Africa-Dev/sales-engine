<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\DiscoveryRun;
use App\Models\Lead;
use App\Models\SocialListeningRun;
use App\Models\SocialSignal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Platform-admin view of how the engine is performing: lead-search speed and yield,
 * contact-finding rates, and social listening yield and losses. Built only from the
 * diagnostics each run already stores server-side; nothing here is shown to customers.
 */
class AdminEngineHealthController extends Controller
{
    private const MAX_RUNS = 500;

    public function show(Request $request): JsonResponse
    {
        $days = max(1, min(90, (int) $request->query('days', 7)));
        $since = now()->subDays($days);

        return response()->json([
            'data' => [
                'window_days' => $days,
                'lead_search' => $this->leadSearch($since),
                'quick_research' => $this->quickResearch($since),
                'contacts' => $this->contacts($since),
                'social_listening' => $this->socialListening($since),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function leadSearch(\DateTimeInterface $since): array
    {
        /** @var Collection<int, DiscoveryRun> $runs */
        $runs = DiscoveryRun::query()
            ->whereIn('intent', ['generate_leads', 'generate_more_leads'])
            ->where('created_at', '>=', $since)
            ->latest('id')
            ->limit(self::MAX_RUNS)
            ->get(['id', 'status', 'result_summary', 'created_at']);

        $completed = $runs->where('status', 'completed');
        $summaries = $completed->map(fn (DiscoveryRun $run): array => is_array($run->result_summary) ? $run->result_summary : []);

        $timings = [];
        foreach ($summaries as $summary) {
            foreach (is_array($summary['timings'] ?? null) ? $summary['timings'] : [] as $stage => $seconds) {
                $timings[$stage][] = (float) $seconds;
            }
        }

        $providerFailures = [];
        foreach ($summaries as $summary) {
            foreach (is_array($summary['provider_failures'] ?? null) ? $summary['provider_failures'] : [] as $provider => $stats) {
                if (is_array($stats) && (int) ($stats['failures'] ?? 0) > 0) {
                    $reason = (string) ($stats['reason'] ?? 'error');
                    $providerFailures[$provider.':'.$reason] = ($providerFailures[$provider.':'.$reason] ?? 0) + 1;
                }
            }
        }

        $metCount = $summaries->filter(fn (array $s): bool => (int) ($s['lead_count'] ?? 0) >= max(1, (int) ($s['requested_lead_count'] ?? 1)))->count();

        return [
            'runs' => $runs->count(),
            'completed' => $completed->count(),
            'failed' => $runs->where('status', 'failed')->count(),
            'avg_seconds' => $this->avg($summaries->pluck('elapsed_seconds')),
            'p90_seconds' => $this->percentile($summaries->pluck('elapsed_seconds'), 0.9),
            'avg_stage_seconds' => collect($timings)->map(fn (array $values): float => round(array_sum($values) / count($values), 1))->sortDesc()->all(),
            'requested_count_met_pct' => $completed->count() > 0 ? round(100 * $metCount / $completed->count()) : null,
            'avg_leads' => $this->avg($summaries->pluck('lead_count')),
            'web_search_degraded_runs' => $summaries->filter(fn (array $s): bool => (bool) ($s['retrieval_degraded'] ?? false))->count(),
            'provider_failures' => collect($providerFailures)->sortDesc()->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function quickResearch(\DateTimeInterface $since): array
    {
        $runs = DiscoveryRun::query()->where('intent', 'quick_research')->where('created_at', '>=', $since)->get(['status']);

        return [
            'runs' => $runs->count(),
            'failed' => $runs->where('status', 'failed')->count(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function contacts(\DateTimeInterface $since): array
    {
        $leads = Lead::query()->where('created_at', '>=', $since)->latest('id')->limit(2000)->get(['meta']);
        $metas = $leads->map(fn (Lead $lead): array => is_array($lead->meta) ? $lead->meta : []);
        $total = max(1, $metas->count());

        $confidence = [];
        foreach ($metas as $meta) {
            foreach (is_array($meta['contact_sources'] ?? null) ? $meta['contact_sources'] : [] as $field => $source) {
                if (is_array($source)) {
                    $key = $field.':'.($source['confidence'] ?? 'unknown');
                    $confidence[$key] = ($confidence[$key] ?? 0) + 1;
                }
            }
        }

        return [
            'leads' => $metas->count(),
            'status' => $metas->countBy(fn (array $m): string => (string) ($m['contact_status'] ?? 'not_attempted'))->all(),
            'with_email_pct' => round(100 * $metas->filter(fn (array $m): bool => filled($m['email'] ?? null) || filled($m['company_email'] ?? null))->count() / $total),
            'with_phone_pct' => round(100 * $metas->filter(fn (array $m): bool => filled($m['phone'] ?? null) || filled($m['company_phone'] ?? null))->count() / $total),
            'sources' => collect($confidence)->sortDesc()->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function socialListening(\DateTimeInterface $since): array
    {
        $runs = SocialListeningRun::query()->where('created_at', '>=', $since)->latest('id')->limit(self::MAX_RUNS)->get(['id', 'status', 'result_summary']);
        $summaries = $runs->where('status', 'completed')->map(fn (SocialListeningRun $run): array => is_array($run->result_summary) ? $run->result_summary : []);

        $rejected = [];
        $detail = [];
        foreach ($summaries as $summary) {
            foreach (is_array($summary['rejected'] ?? null) ? $summary['rejected'] : [] as $bucket => $count) {
                if ($bucket !== 'total') {
                    $rejected[$bucket] = ($rejected[$bucket] ?? 0) + (int) $count;
                }
            }
            foreach (is_array($summary['rejectedDetail'] ?? null) ? $summary['rejectedDetail'] : [] as $reason => $count) {
                $detail[$reason] = ($detail[$reason] ?? 0) + (int) $count;
            }
        }

        $latest = $summaries->first() ?? [];
        $sources = collect(is_array($latest['sources'] ?? null) ? $latest['sources'] : [])
            ->mapWithKeys(fn ($row): array => is_array($row) ? [(string) ($row['key'] ?? '?') => (string) ($row['status'] ?? '?')] : [])
            ->all();

        return [
            'runs' => $runs->count(),
            'failed' => $runs->where('status', 'failed')->count(),
            'posts_checked' => (int) $summaries->sum(fn (array $s): int => (int) ($s['totalChecked'] ?? 0)),
            'strong_openings' => (int) $summaries->sum(fn (array $s): int => (int) ($s['qualified'] ?? 0)),
            'possible_openings' => (int) $summaries->sum(fn (array $s): int => (int) ($s['possible'] ?? 0)),
            'avg_openings_per_scan' => $summaries->count() > 0 ? round($summaries->sum(fn (array $s): int => (int) ($s['qualified'] ?? 0)) / $summaries->count(), 1) : null,
            'dropped' => collect($rejected)->sortDesc()->all(),
            'dropped_detail' => collect($detail)->sortDesc()->all(),
            'latest_source_status' => $sources,
            'signals_by_status' => SocialSignal::query()->selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status')->map(fn ($c): int => (int) $c)->all(),
        ];
    }

    private function avg(Collection $values): ?float
    {
        $numbers = $values->filter(fn ($v): bool => is_numeric($v))->map(fn ($v): float => (float) $v);

        return $numbers->isEmpty() ? null : round($numbers->avg(), 1);
    }

    private function percentile(Collection $values, float $p): ?float
    {
        $numbers = $values->filter(fn ($v): bool => is_numeric($v))->map(fn ($v): float => (float) $v)->sort()->values();
        if ($numbers->isEmpty()) {
            return null;
        }

        return round((float) $numbers[(int) min($numbers->count() - 1, floor($p * $numbers->count()))], 1);
    }
}
