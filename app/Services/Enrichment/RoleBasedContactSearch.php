<?php

namespace App\Services\Enrichment;

use App\Models\Organization;

/**
 * Stage 3's second enrichment path (new_plan.md): when a signal or lead names
 * no specific person, try each of the ICP's target roles at the company in
 * turn until one resolves to a real contact, instead of leaving the record
 * with no enrichment attempt at all.
 */
class RoleBasedContactSearch
{
    public function __construct(
        private readonly ApolloPersonEnricher $apollo,
        private readonly EnrichmentUsageTracker $usageTracker = new EnrichmentUsageTracker,
    ) {}

    public function isEnabled(): bool
    {
        return $this->apollo->isEnabled();
    }

    /**
     * Tries each target role in turn until one resolves to a real contact.
     * Always logs exactly one enrichment attempt for the search as a whole
     * (found or not-found) — the spec's "logged, never blank" guarantee
     * applies at the company level here, since there is no named person.
     *
     * @param  list<string>  $targetRoles
     * @return array{title?: string, company_name?: string, email?: string, phone?: string, linkedin_url?: string, matched_role?: string}
     */
    public function findContact(
        Organization $organization,
        string $companyName,
        array $targetRoles,
        ?int $leadId = null,
        ?int $socialSignalId = null,
    ): array {
        if (trim($companyName) === '' || ! $this->apollo->isEnabled()) {
            return [];
        }

        $found = [];
        foreach ($targetRoles as $role) {
            $role = trim((string) $role);
            if ($role === '') {
                continue;
            }

            $result = $this->apollo->enrichByTitle($organization, $companyName, $role);
            if ($result !== []) {
                $found = $result + ['matched_role' => $role];
                break;
            }
        }

        $this->usageTracker->logEnrichment(
            $organization,
            'tier3',
            'role_based_search',
            ($found['email'] ?? '') !== '',
            ($found['phone'] ?? '') !== '',
            $found !== [] ? 1 : 0,
            null,
            $leadId,
            $found !== [] ? ['matched_role' => $found['matched_role'], 'target_roles' => $targetRoles] : ['target_roles' => $targetRoles],
            $socialSignalId,
        );

        return $found;
    }
}
