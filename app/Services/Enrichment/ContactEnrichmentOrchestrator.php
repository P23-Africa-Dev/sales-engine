<?php

namespace App\Services\Enrichment;

use App\Models\Organization;

class ContactEnrichmentOrchestrator
{
    public function __construct(
        private readonly SnippetContactExtractor $snippetExtractor,
        private readonly BytemineEnricher $bytemine,
        private readonly CleanlistEnricher $cleanlist,
        private readonly ApolloPersonEnricher $apollo,
        private readonly HunterEmailEnricher $hunter,
        private readonly EnrichmentUsageTracker $usageTracker,
    ) {}

    /**
     * Cost-optimized contact waterfall:
     * Tier 1 snippets+GLM → Tier 2 Bytemine/Cleanlist → Tier 3 Apollo/Hunter.
     *
     * @param  array{email?: string, phone?: string, company?: string, website?: string, linkedin_url?: string, profile_urls?: list<string>}  $seed
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     * @return array{email: string, phone: string, linkedin_url: string, title: string, company_name: string, tier: ?string, provider: ?string}
     */
    public function enrichContacts(
        Organization $organization,
        string $personName,
        array $seed = [],
        array $snippets = [],
        ?int $leadId = null,
    ): array {
        $contacts = [
            'email' => trim((string) ($seed['email'] ?? '')),
            'phone' => trim((string) ($seed['phone'] ?? '')),
            'linkedin_url' => trim((string) ($seed['linkedin_url'] ?? ($seed['profile_urls'][0] ?? ''))),
            'title' => '',
            'company_name' => trim((string) ($seed['company'] ?? '')),
            'tier' => null,
            'provider' => null,
        ];

        if ($this->hasCompleteContacts($contacts)) {
            $contacts['tier'] = 'seed';
            $contacts['provider'] = 'existing';

            return $contacts;
        }

        $company = $contacts['company_name'] !== '' ? $contacts['company_name'] : null;
        $domain = $this->resolveDomain($seed['website'] ?? null, $company);

        // Tier 1 — Serper snippets + GLM (free)
        if (! $this->hasCompleteContacts($contacts) && $snippets !== []) {
            $tier1 = $this->snippetExtractor->extractFromSnippets(
                $organization,
                $personName,
                $company,
                $snippets,
            );
            $contacts = $this->mergeContacts($contacts, $tier1, 'tier1', 'snippet_extractor');
            $this->usageTracker->logEnrichment(
                $organization,
                'tier1',
                'snippet_extractor',
                ($tier1['email'] ?? '') !== '',
                ($tier1['phone'] ?? '') !== '',
                0,
                $personName,
                $leadId,
            );

            if ($this->hasCompleteContacts($contacts)) {
                return $contacts;
            }
        }

        $context = array_filter([
            'company' => $company,
            'website' => isset($seed['website']) ? (string) $seed['website'] : null,
            'linkedin_url' => $contacts['linkedin_url'] !== '' ? $contacts['linkedin_url'] : null,
            'domain' => $domain,
        ], fn($v) => is_string($v) && $v !== '');

        // Tier 2a — Bytemine (free/low-cost) — still run even when LinkedIn is known.
        if (! $this->hasCompleteContacts($contacts) && $this->bytemine->isEnabled()) {
            $result = $this->bytemine->enrichPerson($organization, $personName, $context);
            $contacts = $this->mergeContacts($contacts, $result, 'tier2', 'bytemine');
            $this->usageTracker->logEnrichment(
                $organization,
                'tier2',
                'bytemine',
                ($result['email'] ?? '') !== '',
                ($result['phone'] ?? '') !== '',
                (int) ($result['credits_used'] ?? 0),
                $personName,
                $leadId,
            );
            if ($this->hasCompleteContacts($contacts)) {
                return $contacts;
            }
            if (($result['linkedin_url'] ?? '') !== '') {
                $context['linkedin_url'] = (string) $result['linkedin_url'];
            }
            if (($result['company_name'] ?? '') !== '' && $domain === null) {
                $domain = $this->resolveDomain(null, (string) $result['company_name']);
                if ($domain !== null) {
                    $context['domain'] = $domain;
                }
            }
        }

        // Tier 2b — Cleanlist (free/low-cost fallback)
        if (! $this->hasCompleteContacts($contacts) && $this->cleanlist->isEnabled()) {
            $result = $this->cleanlist->enrichPerson($organization, $personName, $context);
            $contacts = $this->mergeContacts($contacts, $result, 'tier2', 'cleanlist');
            $this->usageTracker->logEnrichment(
                $organization,
                'tier2',
                'cleanlist',
                ($result['email'] ?? '') !== '',
                ($result['phone'] ?? '') !== '',
                (int) ($result['credits_used'] ?? 0),
                $personName,
                $leadId,
            );
            if ($this->hasCompleteContacts($contacts)) {
                return $contacts;
            }
        }

        // Tier 3a — Apollo (paid) — skip when a profile/email/phone is already usable.
        if (! $this->hasCompleteContacts($contacts) && ! $this->hasUsableProfile($contacts) && $this->apollo->isEnabled()) {
            $result = $this->apollo->enrich($organization, $personName, $company);
            $contacts = $this->mergeContacts($contacts, $result, 'tier3', 'apollo');
            $this->usageTracker->logEnrichment(
                $organization,
                'tier3',
                'apollo',
                ($result['email'] ?? '') !== '',
                ($result['phone'] ?? '') !== '',
                ($result['email'] ?? '') !== '' || ($result['phone'] ?? '') !== '' ? 1 : 0,
                $personName,
                $leadId,
            );
            if ($this->hasCompleteContacts($contacts)) {
                return $contacts;
            }
            if (($result['company_name'] ?? '') !== '' && $company === null) {
                $company = (string) $result['company_name'];
                $contacts['company_name'] = $company;
            }
            if ($domain === null && $company !== null) {
                $domain = $this->resolveDomain(null, $company);
            }
        }

        // Tier 3b — Hunter email finder (paid)
        if ($contacts['email'] === '' && ! $this->hasUsableProfile($contacts) && $this->hunter->isEnabled() && $domain !== null) {
            $found = $this->hunter->findEmail($personName, $domain);
            if ($found !== null) {
                $contacts = $this->mergeContacts($contacts, ['email' => $found], 'tier3', 'hunter');
                $this->usageTracker->logEnrichment(
                    $organization,
                    'tier3',
                    'hunter',
                    true,
                    false,
                    1,
                    $personName,
                    $leadId,
                );
            } else {
                $this->usageTracker->logEnrichment(
                    $organization,
                    'tier3',
                    'hunter',
                    false,
                    false,
                    0,
                    $personName,
                    $leadId,
                );
            }
        }

        return $contacts;
    }

    /**
     * @param  array{email: string, phone: string, linkedin_url: string, title: string, company_name: string, tier: ?string, provider: ?string}  $contacts
     */
    public function hasCompleteContacts(array $contacts): bool
    {
        return trim((string) ($contacts['email'] ?? '')) !== ''
            && trim((string) ($contacts['phone'] ?? '')) !== '';
    }

    /**
     * Discovery UX can ship with a profile link; do not burn minutes on Apollo/Hunter.
     *
     * @param  array{email?: string, phone?: string, linkedin_url?: string}  $contacts
     */
    public function hasUsableProfile(array $contacts): bool
    {
        if (trim((string) ($contacts['linkedin_url'] ?? '')) !== '') {
            return true;
        }

        return trim((string) ($contacts['email'] ?? '')) !== ''
            || trim((string) ($contacts['phone'] ?? '')) !== '';
    }

    /**
     * @param  array{email: string, phone: string, linkedin_url: string, title: string, company_name: string, tier: ?string, provider: ?string}  $base
     * @param  array<string, mixed>  $incoming
     * @return array{email: string, phone: string, linkedin_url: string, title: string, company_name: string, tier: ?string, provider: ?string}
     */
    private function mergeContacts(array $base, array $incoming, string $tier, string $provider): array
    {
        $filledSomething = false;

        foreach (['email', 'phone', 'linkedin_url', 'title', 'company_name'] as $key) {
            $current = trim((string) ($base[$key] ?? ''));
            $value = trim((string) ($incoming[$key] ?? ''));
            if ($current === '' && $value !== '') {
                $base[$key] = $value;
                $filledSomething = true;
            }
        }

        if ($filledSomething && (
            ($incoming['email'] ?? '') !== '' || ($incoming['phone'] ?? '') !== ''
            || $base['tier'] === null || $base['tier'] === 'seed'
        )) {
            $base['tier'] = $tier;
            $base['provider'] = $provider;
        }

        return $base;
    }

    private function resolveDomain(?string $website, ?string $company): ?string
    {
        $domain = $this->hunter->extractDomain($website);
        if ($domain !== null) {
            return $domain;
        }

        if ($company === null || trim($company) === '') {
            return null;
        }

        $slug = mb_strtolower(preg_replace('/[^a-z0-9]+/u', '', $company) ?? '');

        return $slug !== '' ? $slug . '.com' : null;
    }
}
