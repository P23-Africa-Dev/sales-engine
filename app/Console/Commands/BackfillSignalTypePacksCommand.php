<?php

namespace App\Console\Commands;

use App\Models\IcpProfile;
use App\Models\SignalTypeDefinition;
use Illuminate\Console\Command;

class BackfillSignalTypePacksCommand extends Command
{
    protected $signature = 'sales-engine:backfill-signal-type-packs {--dry-run : Preview without writing}';

    protected $description = 'Set empty ICP signalTypePacks to the Core Buyer Signals default pack';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $updated = 0;

        IcpProfile::query()->orderBy('id')->each(function (IcpProfile $profile) use ($dryRun, &$updated) {
            $config = is_array($profile->config) ? $profile->config : [];
            $packs = array_values(array_filter(
                array_map('strval', $config['signalTypePacks'] ?? []),
                static fn (string $pack) => $pack !== '',
            ));

            if ($packs !== [] || in_array(SignalTypeDefinition::PACK_NONE, $packs, true)) {
                return;
            }

            $this->line("ICP #{$profile->id} ({$profile->name}) → signalTypePacks=['default']");
            $updated++;

            if (! $dryRun) {
                $config['signalTypePacks'] = [SignalTypeDefinition::PACK_DEFAULT];
                $profile->update(['config' => $config]);
            }
        });

        $this->info($dryRun
            ? "Dry run: {$updated} ICP profile(s) would be updated."
            : "Updated {$updated} ICP profile(s).");

        return self::SUCCESS;
    }
}
