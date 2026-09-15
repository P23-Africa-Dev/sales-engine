<?php

namespace App\Services\SignalDetection;

use App\Models\SignalTypeDefinition;
use Illuminate\Support\Collection;

/**
 * Loads the active signal-type detectors for a given set of packs, per
 * docs/backend_implementation_plan.md Phase 3.1. An organization-specific row
 * (organization_id = that org) overrides the global default (organization_id
 * = null) with the same key, letting an org customize a built-in detector
 * without forking the whole registry.
 */
class SignalTypeRegistry
{
    /**
     * @param  list<string>  $packs  e.g. ['default', 'software_dev_vertical']
     * @return Collection<int, SignalTypeDefinition>  keyed by signal type `key`, one row per key
     */
    public function activeForPacks(?int $organizationId, array $packs): Collection
    {
        if ($packs === []) {
            $packs = [SignalTypeDefinition::PACK_DEFAULT];
        }

        $global = SignalTypeDefinition::query()
            ->whereNull('organization_id')
            ->whereIn('pack', $packs)
            ->where('active', true)
            ->get()
            ->keyBy('key')
            ->all(); // plain array: Eloquent Collection::merge() dedupes by model ID, not our string key

        if ($organizationId === null) {
            return collect($global)->values();
        }

        $orgOverrides = SignalTypeDefinition::query()
            ->where('organization_id', $organizationId)
            ->whereIn('pack', $packs)
            ->where('active', true)
            ->get()
            ->keyBy('key')
            ->all();

        // Org rows override global rows sharing the same key (array_merge, not
        // Collection::merge — the latter dedupes by model ID, so a same-key
        // override with a different ID would append instead of replacing);
        // anything only defined globally, or only defined by the org, stays as-is.
        return collect(array_merge($global, $orgOverrides))->values();
    }

    public function find(?int $organizationId, string $key): ?SignalTypeDefinition
    {
        if ($organizationId !== null) {
            $override = SignalTypeDefinition::query()
                ->where('organization_id', $organizationId)
                ->where('key', $key)
                ->first();

            if ($override !== null) {
                return $override;
            }
        }

        return SignalTypeDefinition::query()
            ->whereNull('organization_id')
            ->where('key', $key)
            ->first();
    }
}
