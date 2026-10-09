<?php

namespace App\Console\Commands;

use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Intent\LinkedInActivityDateExtractor;
use App\Services\Intent\SignalFreshnessScorer;
use App\Services\Intent\SocialPostDateParser;
use Illuminate\Console\Command;

/**
 * Re-parse posted_at for existing social signals (fixes fake "now-2h" dates)
 * and dismiss rows that are older than the org freshness window.
 */
class ReparseSocialSignalDatesCommand extends Command
{
    protected $signature = 'social-signals:reparse-dates
        {--organization= : Limit to one organization id}
        {--dry-run : Show actions without writing}
        {--dismiss-stale : Mark stale signals as dismissed}';

    protected $description = 'Re-parse LinkedIn activity dates on social signals and optionally dismiss stale ones';

    public function handle(
        SocialPostDateParser $parser,
        LinkedInActivityDateExtractor $linkedIn,
        SignalFreshnessScorer $freshness,
    ): int {
        $dryRun = (bool) $this->option('dry-run');
        $dismissStale = (bool) $this->option('dismiss-stale');
        $orgId = $this->option('organization');

        $query = SocialSignal::query()->where('status', '!=', 'dismissed');
        if ($orgId) {
            $query->where('organization_id', (int) $orgId);
        }

        $updated = 0;
        $dismissed = 0;
        $unchanged = 0;

        $query->orderBy('id')->chunkById(100, function ($signals) use (
            $parser,
            $linkedIn,
            $freshness,
            $dryRun,
            $dismissStale,
            &$updated,
            &$dismissed,
            &$unchanged,
        ) {
            foreach ($signals as $signal) {
                $fromUrl = $linkedIn->fromUrl($signal->post_url);
                $fromMeta = $parser->parse(
                    is_array($signal->meta) ? ($signal->meta['date_raw'] ?? null) : null,
                    is_array($signal->meta) ? ($signal->meta['snippet'] ?? null) : null,
                    null,
                    $signal->post_url,
                );
                $parsed = $fromUrl ?? $fromMeta;

                // Detect classic fake timestamp: posted_at ~= created_at - 2 hours
                $looksFake = false;
                if ($signal->posted_at && $signal->created_at) {
                    $delta = abs($signal->created_at->diffInMinutes($signal->posted_at->copy()->addHours(2)));
                    $looksFake = $delta <= 5;
                }

                if ($parsed === null && ! $looksFake) {
                    $unchanged++;
                    continue;
                }

                $window = 14;
                $settings = SocialListeningSetting::query()
                    ->where('organization_id', $signal->organization_id)
                    ->where('icp_profile_id', $signal->icp_profile_id)
                    ->first();
                if ($settings) {
                    $window = max(1, (int) ($settings->freshness_window_days ?? 14));
                }

                $newPostedAt = $parsed;
                if ($parsed === null && $looksFake) {
                    $newPostedAt = null;
                }

                $shouldDismiss = $dismissStale && $freshness->isStale($newPostedAt, $window);

                if ($dryRun) {
                    $this->line(sprintf(
                        'signal %d posted_at %s -> %s%s',
                        $signal->id,
                        $signal->posted_at?->toIso8601String() ?? 'null',
                        $newPostedAt?->toIso8601String() ?? 'null',
                        $shouldDismiss ? ' [dismiss]' : '',
                    ));
                } else {
                    $meta = is_array($signal->meta) ? $signal->meta : [];
                    $meta['date_reparsed_at'] = now()->toIso8601String();
                    $meta['posted_at_source'] = $fromUrl ? 'linkedin_activity_id' : ($parsed ? 'parser' : 'cleared_fake');

                    $signal->posted_at = $newPostedAt;
                    $signal->meta = $meta;
                    if ($shouldDismiss) {
                        $signal->status = 'dismissed';
                        $dismissed++;
                    }
                    $signal->save();
                }

                $updated++;
            }
        });

        $this->info(($dryRun ? '[dry-run] ' : '') . "Updated {$updated}, dismissed {$dismissed}, unchanged {$unchanged}");

        return self::SUCCESS;
    }
}
