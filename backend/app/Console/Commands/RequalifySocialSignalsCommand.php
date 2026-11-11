<?php

namespace App\Console\Commands;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\ListeningProfileFactory;
use App\Services\Intent\OpportunityGate;
use App\Services\Intent\SocialSignalEnricher;
use App\Services\Llm\GlmClient;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

/**
 * Re-checks existing social signals against the ICP as it is now understood: what the account
 * is LOOKING FOR, not what it does. Signals that are no longer a real opening for that need are
 * retired (hidden, reversible, never deleted); kept signals get a refreshed dossier.
 *
 * Dry run by default. Signals a user already acted on (outreach sent, synced, saved as a lead)
 * are never changed — they are only reported.
 */
class RequalifySocialSignalsCommand extends Command
{
    protected $signature = 'social-signals:requalify
        {--organization= : Limit to one organization id}
        {--icp= : Limit to one ICP profile id}
        {--limit=0 : Stop after this many signals (0 = all)}
        {--apply : Write changes (default is a dry run that only reports)}
        {--restore= : Path (under storage/app) of an earlier report: un-retire the signals it retired}';

    protected $description = 'Re-qualify existing social signals against the ICP-as-need logic; retire false signals (reversible)';

    private const BATCH = 8;

    /** Signals a user has acted on are left exactly as they are. */
    private const PROTECTED_STATUSES = ['outreached', 'synced'];

    public function handle(
        ListeningProfileFactory $profiles,
        SocialSignalEnricher $enricher,
        OpportunityGate $gate,
        GlmClient $glm,
    ): int {
        if (($restore = $this->option('restore')) !== null) {
            return $this->restore((string) $restore);
        }

        if (! $glm->isConfigured()) {
            // The fallback qualifier rejects everything; running without the model would retire every signal.
            $this->error('GLM is not configured. Refusing to re-qualify without the AI qualifier.');

            return self::FAILURE;
        }

        $apply = (bool) $this->option('apply');
        $limit = max(0, (int) $this->option('limit'));
        $report = ['mode' => $apply ? 'apply' : 'dry-run', 'started_at' => now()->toIso8601String(), 'icps' => [], 'signals' => []];
        $totals = ['checked' => 0, 'kept' => 0, 'retired' => 0, 'protected_irrelevant' => 0, 'protected_kept' => 0, 'unknown' => 0];

        $query = SocialSignal::query()
            ->whereNotIn('status', SocialSignal::HIDDEN_STATUSES)
            ->orderBy('organization_id')->orderBy('icp_profile_id')->orderBy('id');
        if ($this->option('organization')) {
            $query->where('organization_id', (int) $this->option('organization'));
        }
        if ($this->option('icp')) {
            $query->where('icp_profile_id', (int) $this->option('icp'));
        }

        $groups = $query->get()->groupBy(fn (SocialSignal $s): string => $s->organization_id.':'.$s->icp_profile_id);

        foreach ($groups as $key => $signals) {
            [$orgId, $icpId] = array_map('intval', explode(':', (string) $key));
            $organization = Organization::query()->find($orgId);
            $icp = $icpId ? IcpProfile::query()->find($icpId) : null;
            if (! $organization || ! $icp) {
                $this->warn("Skipping org {$orgId} / ICP {$icpId}: organization or ICP no longer exists.");

                continue;
            }

            $brief = IcpBrief::fromIcpProfile($icp);
            $profile = $profiles->make($organization, $brief);
            $minScore = (float) (SocialListeningSetting::query()->where('organization_id', $orgId)->value('min_score') ?? 55);
            $report['icps'][] = [
                'organization_id' => $orgId,
                'icp_profile_id' => $icpId,
                'icp_name' => $icp->name,
                'need' => trim($brief->customPrompt.' '.$brief->description),
                'listening_mode' => $profile->mode,
                'target' => $profile->target,
                'min_score' => $minScore,
                'signals' => $signals->count(),
            ];
            $this->line("ICP #{$icpId} \"{$icp->name}\" ({$signals->count()} signals) — need type: {$profile->mode}, target: {$profile->target}");

            foreach ($signals->chunk(self::BATCH) as $batch) {
                if ($limit > 0 && $totals['checked'] >= $limit) {
                    break 2;
                }
                $this->requalifyBatch($batch->values(), $organization, $icp, $profile, $enricher, $gate, $minScore, $apply, $totals, $report);
            }
        }

        $report['totals'] = $totals;
        $report['finished_at'] = now()->toIso8601String();
        $path = 'requalify/social-signals-'.now()->format('Ymd-His').'-'.($apply ? 'apply' : 'dry-run').'.json';
        Storage::disk('local')->put($path, (string) json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $this->table(array_keys($totals), [array_values($totals)]);
        $this->info(($apply ? 'Applied. ' : 'Dry run only — nothing changed. ').'Report: storage/app/'.$path);

        return self::SUCCESS;
    }

    /**
     * @param  Collection<int, SocialSignal>  $batch
     * @param  array<string, int>  $totals
     * @param  array<string, mixed>  $report
     */
    private function requalifyBatch(
        Collection $batch,
        Organization $organization,
        IcpProfile $icp,
        mixed $profile,
        SocialSignalEnricher $enricher,
        OpportunityGate $gate,
        float $minScore,
        bool $apply,
        array &$totals,
        array &$report,
    ): void {
        $items = $batch->map(fn (SocialSignal $signal): array => ['hit' => $this->hitFor($signal), 'signalType' => null])->all();
        $results = $enricher->enrichMany($organization, $icp, $items, $profile);

        foreach ($batch as $index => $signal) {
            $totals['checked']++;
            $enriched = $results[$index] ?? [];
            $text = trim($signal->post_text."\n".($signal->meta['title'] ?? '')."\n".($signal->meta['snippet'] ?? ''));

            if ($enriched === [] || ($enriched['from_heuristic'] ?? false) === true) {
                // The model didn't answer for this post: no evidence either way, leave it alone.
                $totals['unknown']++;
                $report['signals'][] = $this->row($signal, 'unknown', 'qualifier unavailable for this post', null);

                continue;
            }

            $reason = $gate->rejection($enriched, $text, $profile, confirmedSignalType: $signal->signal_type_key !== null);
            $score = (float) ($enriched['score'] ?? 0);
            if ($reason === null && $score < $minScore) {
                $reason = 'below_min_score';
            }

            $isProtected = in_array($signal->status, self::PROTECTED_STATUSES, true) || $signal->lead_id !== null || $signal->f23_lead_id !== null;
            if ($reason !== null) {
                $verdict = $isProtected ? 'protected_irrelevant' : 'retired';
                $totals[$verdict]++;
                $report['signals'][] = $this->row($signal, $verdict, $reason, $enriched);
                if ($apply && ! $isProtected) {
                    $meta = is_array($signal->meta) ? $signal->meta : [];
                    $meta['requalify'] = [
                        'verdict' => 'retired',
                        'reason' => $reason,
                        'score' => $score,
                        'retired_from_status' => $signal->status,
                        'at' => now()->toIso8601String(),
                    ];
                    $signal->update(['status' => SocialSignal::STATUS_RETIRED, 'meta' => $meta]);
                }

                continue;
            }

            $verdict = $isProtected ? 'protected_kept' : 'kept';
            $totals[$verdict]++;
            $report['signals'][] = $this->row($signal, $verdict, null, $enriched);
            if ($apply && ! $isProtected) {
                $meta = is_array($signal->meta) ? $signal->meta : [];
                $meta['requalify'] = ['verdict' => 'kept', 'score' => $score, 'at' => now()->toIso8601String()];
                // Refresh the dossier so "why this matters" speaks to what the account needs.
                $signal->update(array_filter([
                    'why_this_matters_to_you' => $this->clip($enriched['why_this_matters_to_you'] ?? null, 1000),
                    'suggested_message' => $enriched['suggested_message'] ?? null,
                    'reasons' => is_array($enriched['reasons'] ?? null) && $enriched['reasons'] !== [] ? $enriched['reasons'] : null,
                    'benefits' => is_array($enriched['benefits'] ?? null) && $enriched['benefits'] !== [] ? $enriched['benefits'] : null,
                    'personal_recommended_action_title' => $this->clip($enriched['personal_recommended_action_title'] ?? null, 255),
                    'personal_recommended_action_detail' => $this->clip($enriched['personal_recommended_action_detail'] ?? null, 1000),
                ], static fn ($value): bool => $value !== null && $value !== '') + ['meta' => $meta]);
            }
        }
    }

    private function restore(string $path): int
    {
        if (! Storage::disk('local')->exists($path)) {
            $this->error("Report not found: storage/app/{$path}");

            return self::FAILURE;
        }

        $report = json_decode((string) Storage::disk('local')->get($path), true);
        $ids = collect($report['signals'] ?? [])->where('verdict', 'retired')->pluck('id')->all();
        $restored = 0;
        SocialSignal::query()->whereIn('id', $ids)->where('status', SocialSignal::STATUS_RETIRED)->get()
            ->each(function (SocialSignal $signal) use (&$restored): void {
                $meta = is_array($signal->meta) ? $signal->meta : [];
                $previous = (string) ($meta['requalify']['retired_from_status'] ?? 'new');
                unset($meta['requalify']);
                $signal->update(['status' => $previous, 'meta' => $meta]);
                $restored++;
            });

        $this->info("Restored {$restored} signal(s).");

        return self::SUCCESS;
    }

    private function hitFor(SocialSignal $signal): RawSocialHit
    {
        $meta = is_array($signal->meta) ? $signal->meta : [];

        return new RawSocialHit(
            platform: (string) $signal->platform,
            sourceLabel: (string) $signal->source_label,
            sourceIcon: (string) $signal->source_icon,
            postText: (string) $signal->post_text,
            postUrl: $signal->post_url,
            snippet: isset($meta['snippet']) ? (string) $meta['snippet'] : null,
            title: isset($meta['title']) ? (string) $meta['title'] : null,
            authorName: isset($meta['author_name']) ? (string) $meta['author_name'] : $signal->profile_name,
            authorProfileUrl: $signal->author_profile_url,
            postedAt: $signal->posted_at,
            fullText: true,
        );
    }

    /**
     * @param  array<string, mixed>|null  $enriched
     * @return array<string, mixed>
     */
    private function row(SocialSignal $signal, string $verdict, ?string $reason, ?array $enriched): array
    {
        return [
            'id' => $signal->id,
            'organization_id' => $signal->organization_id,
            'icp_profile_id' => $signal->icp_profile_id,
            'status_before' => $signal->status,
            'verdict' => $verdict,
            'reason' => $reason,
            'old_score' => (float) $signal->score,
            'new_score' => $enriched !== null ? (float) ($enriched['score'] ?? 0) : null,
            'author_role' => $enriched['author_role'] ?? null,
            'post' => mb_substr((string) $signal->post_text, 0, 200),
            'url' => $signal->post_url,
            'why_now' => $enriched !== null ? mb_substr((string) ($enriched['why_this_matters_to_you'] ?? ''), 0, 240) : null,
        ];
    }

    private function clip(mixed $value, int $max): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return mb_substr(trim($value), 0, $max);
    }
}
