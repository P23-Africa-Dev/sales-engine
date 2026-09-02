<?php

namespace App\Console\Commands;

use App\Models\ExternalIdentity;
use App\Models\Organization;
use Illuminate\Console\Command;

class BackfillF23OrganizationLinkCommand extends Command
{
    protected $signature = 'organizations:backfill-f23-link {--dry-run : Preview changes without writing}';

    protected $description = 'Backfill f23_company_id on organizations from Factory23 external identities';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $updated = 0;

        $identities = ExternalIdentity::query()
            ->where('provider', 'factory23')
            ->whereNotNull('external_company_id')
            ->where('external_company_id', '!=', '')
            ->with('user.organizations')
            ->get();

        foreach ($identities as $identity) {
            $companyId = (string) $identity->external_company_id;

            $linkedOrg = Organization::query()->where('f23_company_id', $companyId)->first();
            if ($linkedOrg) {
                continue;
            }

            $userOrgs = $identity->user?->organizations ?? collect();
            foreach ($userOrgs as $org) {
                if (filled($org->f23_company_id)) {
                    continue;
                }

                $this->line("Link org #{$org->id} ({$org->name}) → f23_company_id={$companyId}");

                if (! $dryRun) {
                    $payload = ['f23_company_id' => $companyId];
                    if (config('services.factory23.crm_sync_enabled')) {
                        $payload['factory23_crm_sync_enabled'] = true;
                    }
                    $org->update($payload);
                }

                $updated++;
                break;
            }
        }

        $this->info($dryRun
            ? "Dry run: {$updated} organization(s) would be linked."
            : "Linked {$updated} organization(s).");

        return self::SUCCESS;
    }
}
