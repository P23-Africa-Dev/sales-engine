<?php

namespace App\Services\SignalDetection;

use App\Services\SignalDetection\DTO\GateResult;
use Carbon\CarbonInterface;

/**
 * Stage 2's mandatory-grounding rule (new_plan.md):
 *
 *   "If source_url or source_date is missing, the signal is discarded —
 *    not surfaced with lower confidence, discarded."
 *
 * This replaces SignalFreshnessScorer::isStale()'s previous role as the
 * hard reject decision. isStale() treated an unknown posted-at date as
 * "not stale" (it passed through with only a mild scoring discount) —
 * exactly the behavior the spec forbids. This gate has no such leniency:
 * a missing URL or a missing date always rejects, unconditionally.
 *
 * SignalFreshnessScorer is still used (by callers of this gate) for its
 * actual remaining job — the freshness *scoring curve* applied to signals
 * that already passed this hard gate — but only ever with a known date,
 * since a null date never reaches that stage anymore.
 */
class SignalGroundingGate
{
    public function admit(?string $sourceUrl, ?CarbonInterface $sourceDate, int $recencyWindowDays, ?CarbonInterface $now = null): GateResult
    {
        if (trim((string) $sourceUrl) === '') {
            return GateResult::reject('missing_source_url');
        }

        if ($sourceDate === null) {
            return GateResult::reject('missing_source_date');
        }

        $now = $now ?? now();
        $windowDays = max(1, $recencyWindowDays);

        if ($sourceDate->lt($now->copy()->subDays($windowDays))) {
            return GateResult::reject('stale');
        }

        return GateResult::admit();
    }
}
