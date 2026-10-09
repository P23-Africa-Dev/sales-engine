<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Services\Discovery\CompanyNameValidator;
use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\QueryIntentService;
use Illuminate\Console\Command;

/**
 * Re-validate draft leads against entity validators and delete/flag non-entity junk
 * (article titles, advice content, generic phrases).
 */
class RevalidateLeadsCommand extends Command
{
    protected $signature = 'leads:revalidate
        {--organization= : Limit to one organization id}
        {--apply : Delete invalid draft leads (default is dry-run)}
        {--flag : Flag invalid leads in meta instead of deleting}';

    protected $description = 'Re-check draft unsynced leads and remove/flag non-entity junk names';

    public function handle(
        PersonNameValidator $personValidator,
        CompanyNameValidator $companyValidator,
        QueryIntentService $queryIntent,
    ): int {
        $apply = (bool) $this->option('apply');
        $flag = (bool) $this->option('flag');
        $orgId = $this->option('organization');

        $query = Lead::query()
            ->where('save_status', Lead::SAVE_DRAFT)
            ->whereNull('synced_to_f23_at');

        if ($orgId) {
            $query->where('organization_id', (int) $orgId);
        }

        $invalid = 0;
        $kept = 0;
        $acted = 0;

        $query->orderBy('id')->chunkById(100, function ($leads) use (
            $personValidator,
            $companyValidator,
            $queryIntent,
            $apply,
            $flag,
            &$invalid,
            &$kept,
            &$acted,
        ) {
            foreach ($leads as $lead) {
                $meta = is_array($lead->meta) ? $lead->meta : [];
                $name = trim((string) $lead->name);

                $looksLikePerson = filled($meta['title'] ?? null)
                    || filled($meta['linkedin_url'] ?? null)
                    || (is_array($meta['profile_urls'] ?? null) && ($meta['profile_urls'] ?? []) !== [])
                    || filled($meta['email'] ?? null);

                $isValid = true;
                if ($queryIntent->looksLikeContentOrGenericPhrase($name)) {
                    $isValid = false;
                } elseif ($looksLikePerson) {
                    $isValid = $personValidator->isValidPersonName($name, $meta);
                } else {
                    $isValid = $companyValidator->isValidCompanyName($name, $meta);
                    // Also reject if it looks like a person-headline that slipped into company mode.
                    if ($isValid && ! $personValidator->isValidPersonName($name, $meta)
                        && preg_match('/\b(with|for|to|via|using)\b/ui', $name)
                        && str_word_count($name) >= 4) {
                        $isValid = false;
                    }
                }

                if ($isValid) {
                    $kept++;
                    continue;
                }

                $invalid++;
                $this->line(sprintf(
                    'lead %d [%s] invalid: %s',
                    $lead->id,
                    $looksLikePerson ? 'person' : 'company',
                    $name,
                ));

                if (! $apply && ! $flag) {
                    continue;
                }

                if ($flag && ! $apply) {
                    $meta['invalid_entity'] = true;
                    $meta['invalid_entity_at'] = now()->toIso8601String();
                    $lead->meta = $meta;
                    $lead->save();
                    $acted++;
                    continue;
                }

                if ($apply) {
                    $lead->delete();
                    $acted++;
                }
            }
        });

        $mode = $apply ? 'apply' : ($flag ? 'flag' : 'dry-run');
        $this->info("[{$mode}] invalid={$invalid}, kept={$kept}, acted={$acted}");

        return self::SUCCESS;
    }
}
