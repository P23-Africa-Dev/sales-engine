<?php

namespace App\Services\CompanyCache;

use App\Models\Company;
use App\Models\Organization;
use App\Services\Discovery\DTO\RawDiscoveryHit;

class CompanyCacheService
{
    public function findFuzzy(Organization $organization, string $name, ?string $location = null, ?string $sector = null): ?Company
    {
        $normalized = Company::normalizeName($name);

        $query = Company::query()
            ->where('organization_id', $organization->id)
            ->where('normalized_name', $normalized);

        if ($location) {
            $query->where(function ($q) use ($location) {
                $q->whereNull('location')
                    ->orWhere('location', 'like', '%'.mb_substr($location, 0, 20).'%');
            });
        }

        $match = $query->first();
        if ($match) {
            return $match;
        }

        return Company::query()
            ->where('organization_id', $organization->id)
            ->where('normalized_name', 'like', '%'.$normalized.'%')
            ->when($sector, fn ($q) => $q->where('sector', $sector))
            ->first();
    }

    public function upsertFromHit(Organization $organization, RawDiscoveryHit $hit, array $extra = []): Company
    {
        $existing = $this->findFuzzy($organization, $hit->name, $hit->location, $hit->sector);

        $payload = array_merge([
            'name' => $hit->name,
            'normalized_name' => Company::normalizeName($hit->name),
            'sector' => $hit->sector,
            'location' => $hit->location,
            'website' => $hit->website,
            'source' => $hit->source,
            'source_provider' => $hit->provider,
            'external_id' => $hit->externalId,
            'summary' => $hit->snippet,
            'last_enriched_at' => now(),
        ], $extra);

        if ($existing) {
            $existing->fill(array_filter($payload, fn ($v) => $v !== null));
            $existing->save();

            return $existing->fresh();
        }

        return Company::query()->create(array_merge($payload, [
            'organization_id' => $organization->id,
        ]));
    }
}
