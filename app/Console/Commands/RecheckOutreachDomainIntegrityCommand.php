<?php

namespace App\Console\Commands;

use App\Services\Outreach\DomainIntegrityService;
use Illuminate\Console\Command;

class RecheckOutreachDomainIntegrityCommand extends Command
{
    protected $signature = 'outreach:recheck-domain-integrity';

    protected $description = 'Re-evaluate SPF/DKIM/DMARC-related integrity for verified outreach domains';

    public function handle(DomainIntegrityService $integrity): int
    {
        $count = $integrity->recheckAll();
        $this->info("Rechecked {$count} verified outreach domain(s).");

        return self::SUCCESS;
    }
}
