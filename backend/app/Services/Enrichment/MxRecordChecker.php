<?php

namespace App\Services\Enrichment;

use Illuminate\Support\Facades\Cache;

/**
 * DNS MX lookup behind a class so tests can swap it for a fake.
 */
class MxRecordChecker
{
    public function hasMx(string $domain): bool
    {
        $domain = mb_strtolower(trim($domain));
        if ($domain === '') {
            return false;
        }

        return (bool) Cache::remember('enrichment:mx:v1:'.$domain, now()->addDay(), function () use ($domain): bool {
            try {
                $records = @dns_get_record($domain, DNS_MX);
            } catch (\Throwable) {
                return false;
            }

            return is_array($records) && $records !== [];
        });
    }
}
