<?php

namespace App\Services\Intent;

use App\Models\Company;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\RoleBasedContactSearch;
use App\Services\Integrations\Factory23\CrmSyncService;

class SignalToLeadService
{
    public function __construct(
        private readonly CrmSyncService $crmSync,
        private readonly ContactEnrichmentOrchestrator $contactOrchestrator,
        private readonly RoleBasedContactSearch $roleBasedSearch,
    ) {}

    /**
     * @return array{lead: Lead, crm: ?array}
     */
    public function convert(SocialSignal $signal, Organization $organization, bool $pushCrm = true): array
    {
        if (filled($signal->lead_id)) {
            $existing = Lead::query()
                ->where('organization_id', $organization->id)
                ->find($signal->lead_id);

            if ($existing) {
                $crm = null;
                if ($pushCrm && $this->crmSync->canSync($organization) && blank($existing->f23_lead_id)) {
                    try {
                        $crm = $this->crmSync->pushLead(
                            $organization,
                            $existing,
                            $this->crmPushOptions($organization, $signal),
                        );
                        $existing->refresh();
                        $signal->update([
                            'f23_lead_id' => $existing->f23_lead_id,
                            'status' => $crm ? 'synced' : $signal->status,
                        ]);
                    } catch (\Throwable) {
                        // best effort
                    }
                }

                return ['lead' => $existing, 'crm' => $crm];
            }
        }

        $isIndividual = $this->isIndividualPoster($signal);
        $companyName = $this->resolveCompanyName($signal, $isIndividual);
        $leadName = $this->resolveLeadName($signal, $isIndividual, $companyName);

        $company = Company::query()->firstOrCreate(
            [
                'organization_id' => $organization->id,
                'normalized_name' => Company::normalizeName($companyName),
                'location' => $signal->location_text,
            ],
            [
                'name' => $companyName,
                'source' => 'social_listening',
                'source_provider' => $signal->platform,
                'summary' => $signal->summary ?: $signal->post_text,
                'priority_score' => $signal->score,
            ]
        );

        $linkedinUrl = $this->extractLinkedInUrl($signal);
        $authorProfileUrl = trim((string) ($signal->author_profile_url ?? ''));
        $postUrl = trim((string) ($signal->post_url ?? ''));

        $leadMeta = array_filter([
            'social_signal_id' => $signal->id,
            'post_url' => $postUrl !== '' ? $postUrl : null,
            'source_url' => $authorProfileUrl !== '' ? $authorProfileUrl : ($postUrl !== '' ? $postUrl : null),
            'title' => trim((string) ($signal->persona ?? '')) ?: null,
            'company' => $isIndividual ? null : $companyName,
            'location' => trim((string) ($signal->location_text ?? '')) ?: null,
            'linkedin_url' => $linkedinUrl,
            'profile_urls' => array_values(array_filter([
                $authorProfileUrl !== '' ? $authorProfileUrl : null,
                $linkedinUrl,
                $postUrl !== '' ? $postUrl : null,
            ])),
            'industry' => trim((string) ($signal->industry ?? '')) ?: null,
            'key_topics' => $signal->key_topics ?: null,
            'competitors' => $signal->competitors ?: null,
            'signal_source' => $signal->platform,
            'entity_type' => $isIndividual ? 'individual' : 'company',
            'crm_destination' => $this->resolveCrmDestination($organization, $signal),
        ], static fn ($value) => $value !== null && $value !== [] && $value !== '');

        $lead = Lead::query()->create([
            'organization_id' => $organization->id,
            'company_id' => $company->id,
            'icp_profile_id' => $signal->icp_profile_id,
            'name' => $leadName,
            'source' => 'social_'.$signal->platform,
            'score' => $signal->score,
            'summary' => $signal->summary ?: $signal->post_text,
            'stage' => 'new',
            'meta' => $leadMeta,
        ]);

        if ($pushCrm) {
            $leadMeta = $this->enrichContactsIntoMeta($organization, $signal, $lead, $leadMeta, $isIndividual);
            $lead->update(['meta' => $leadMeta]);
            $lead->refresh();
        }

        $crm = null;
        if ($pushCrm && $this->crmSync->canSync($organization)) {
            try {
                $crm = $this->crmSync->pushLead(
                    $organization,
                    $lead,
                    $this->crmPushOptions($organization, $signal),
                );
                $lead->refresh();
            } catch (\Throwable) {
                // best effort — local lead still created
            }
        }

        $signal->update([
            'lead_id' => $lead->id,
            'f23_lead_id' => $lead->f23_lead_id,
            'status' => $crm ? 'synced' : 'reviewed',
        ]);

        return ['lead' => $lead, 'crm' => $crm];
    }

    private function isIndividualPoster(SocialSignal $signal): bool
    {
        $entityType = mb_strtolower(trim((string) ($signal->entity_type ?? '')));
        $companyName = mb_strtolower(trim((string) ($signal->company_name ?? '')));

        return $entityType === 'individual' || $companyName === 'individual' || $companyName === '';
    }

    private function resolveCompanyName(SocialSignal $signal, bool $isIndividual): string
    {
        if ($isIndividual) {
            $profile = trim((string) ($signal->profile_name ?? ''));

            return $profile !== '' ? $profile : 'Social prospect';
        }

        $company = trim((string) ($signal->company_name ?? ''));
        if ($company !== '' && mb_strtolower($company) !== 'individual') {
            return $company;
        }

        $profile = trim((string) ($signal->profile_name ?? ''));

        return $profile !== '' ? $profile : 'Social prospect';
    }

    private function resolveLeadName(SocialSignal $signal, bool $isIndividual, string $companyName): string
    {
        if ($isIndividual) {
            $profile = trim((string) ($signal->profile_name ?? ''));

            return $profile !== '' ? $profile : $companyName;
        }

        return $companyName;
    }

    private function extractLinkedInUrl(SocialSignal $signal): ?string
    {
        foreach ([$signal->author_profile_url, $signal->post_url] as $candidate) {
            $url = trim((string) $candidate);
            if ($url !== '' && str_contains(mb_strtolower($url), 'linkedin.com/in/')) {
                return $url;
            }
            if ($url !== '' && preg_match('~linkedin\.com/posts/([^/?#_]+)~i', $url, $m)) {
                return 'https://www.linkedin.com/in/'.urldecode($m[1]);
            }
        }

        return null;
    }

    /**
     * Stage 3 (new_plan.md): every named person on this signal gets an
     * enrichment attempt logged (via ContactEnrichmentOrchestrator ->
     * EnrichmentLog); a signal naming no person at all falls back to a
     * role-based search against the ICP's target roles. Either way,
     * `$signal->enrichment_status` always ends up in a defined state —
     * never left blank/undetermined.
     *
     * @param  array<string, mixed>  $leadMeta
     * @return array<string, mixed>
     */
    private function enrichContactsIntoMeta(
        Organization $organization,
        SocialSignal $signal,
        Lead $lead,
        array $leadMeta,
        bool $isIndividual,
    ): array {
        $company = ! $isIndividual
            ? trim((string) ($signal->company_name ?? ''))
            : trim((string) ($leadMeta['company'] ?? ''));
        if (mb_strtolower($company) === 'individual') {
            $company = '';
        }

        $namedPeople = $this->resolveNamedPeople($signal, $lead);
        $attempted = false;
        $found = false;

        if ($namedPeople !== []) {
            foreach ($namedPeople as $index => $personName) {
                $attempted = true;

                try {
                    $enriched = $this->contactOrchestrator->enrichContacts(
                        $organization,
                        $personName,
                        array_filter([
                            'company' => $company !== '' ? $company : null,
                            // Seed data (existing profile URL/company) only makes sense
                            // for the primary (first) named person on the signal.
                            'linkedin_url' => $index === 0 ? ($leadMeta['linkedin_url'] ?? null) : null,
                            'profile_urls' => $index === 0 ? ($leadMeta['profile_urls'] ?? []) : [],
                        ]),
                        [],
                        $lead->id,
                        $signal->id,
                        $index,
                    );
                } catch (\Throwable) {
                    continue;
                }

                if (($enriched['email'] ?? '') !== '' || ($enriched['phone'] ?? '') !== '') {
                    $found = true;
                }

                // Lead.meta only has room for one contact's shape; the primary
                // (first) named person populates it. Every person's attempt is
                // still fully recorded in EnrichmentLog regardless.
                if ($index === 0) {
                    $leadMeta = $this->mergeEnrichedIntoLeadMeta($leadMeta, $enriched);
                }
            }
        } elseif ($company !== '') {
            $attempted = true;
            $result = $this->roleBasedSearch->findContact(
                $organization,
                $company,
                $this->targetRolesForSignal($signal),
                $lead->id,
                $signal->id,
            );

            if (($result['email'] ?? '') !== '' || ($result['phone'] ?? '') !== '') {
                $found = true;
                $leadMeta = $this->mergeEnrichedIntoLeadMeta($leadMeta, $result + ['tier' => 'tier3', 'provider' => 'role_based_search']);
            }
        }

        if ($attempted) {
            $signal->update([
                'enrichment_status' => $found ? SocialSignal::ENRICHMENT_ATTEMPTED_FOUND : SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND,
                'enrichment_attempted_at' => now(),
            ]);
        }

        return $leadMeta;
    }

    /**
     * @return list<string>
     */
    private function resolveNamedPeople(SocialSignal $signal, Lead $lead): array
    {
        $named = is_array($signal->named_people) ? $signal->named_people : [];
        $named = array_values(array_filter(
            array_map(static fn ($n) => trim((string) $n), $named),
            fn ($n) => $this->looksLikeARealName($n),
        ));

        if ($named !== []) {
            return $named;
        }

        // Deliberately NOT falling back to $lead->name here: when neither the
        // signal nor the company has a real name, resolveLeadName() itself
        // falls back to the placeholder "Social prospect" — using that as a
        // "named person" would enrich a literal placeholder string as if it
        // were someone's name.
        $fallback = trim((string) $signal->profile_name);

        return $this->looksLikeARealName($fallback) ? [$fallback] : [];
    }

    private function looksLikeARealName(string $name): bool
    {
        $normalized = mb_strtolower(trim($name));

        return $normalized !== '' && ! in_array($normalized, ['unknown', 'social prospect'], true);
    }

    /**
     * @return list<string>
     */
    private function targetRolesForSignal(SocialSignal $signal): array
    {
        $config = is_array($signal->icpProfile?->config) ? $signal->icpProfile->config : [];

        return array_values(array_filter(
            array_map('strval', $config['decisionMakers'] ?? []),
            static fn ($role) => trim($role) !== '',
        ));
    }

    /**
     * @param  array<string, mixed>  $leadMeta
     * @param  array<string, mixed>  $enriched
     * @return array<string, mixed>
     */
    private function mergeEnrichedIntoLeadMeta(array $leadMeta, array $enriched): array
    {
        if (($enriched['email'] ?? '') !== '') {
            $leadMeta['email'] = $enriched['email'];
        }
        if (($enriched['phone'] ?? '') !== '') {
            $leadMeta['phone'] = $enriched['phone'];
        }
        if (($enriched['linkedin_url'] ?? '') !== '') {
            $leadMeta['linkedin_url'] = $enriched['linkedin_url'];
            $profiles = is_array($leadMeta['profile_urls'] ?? null) ? $leadMeta['profile_urls'] : [];
            $profiles[] = $enriched['linkedin_url'];
            $leadMeta['profile_urls'] = array_values(array_unique(array_filter($profiles)));
        }
        if (($enriched['title'] ?? '') !== '' && empty($leadMeta['title'])) {
            $leadMeta['title'] = $enriched['title'];
        }
        if (($enriched['company_name'] ?? '') !== '' && empty($leadMeta['company'])) {
            $leadMeta['company'] = $enriched['company_name'];
        }
        if (($enriched['tier'] ?? null) !== null) {
            $leadMeta['contact_enrichment_tier'] = $enriched['tier'];
            $leadMeta['contact_enrichment_provider'] = $enriched['provider'] ?? null;
        }

        return $leadMeta;
    }

    private function resolveCrmDestination(Organization $organization, SocialSignal $signal): string
    {
        $settings = SocialListeningSetting::query()
            ->where('organization_id', $organization->id)
            ->when(
                $signal->icp_profile_id,
                fn ($q) => $q->where('icp_profile_id', $signal->icp_profile_id),
            )
            ->orderByDesc('id')
            ->first();

        if (! $settings) {
            $settings = SocialListeningSetting::query()
                ->where('organization_id', $organization->id)
                ->orderByDesc('id')
                ->first();
        }

        $destination = trim((string) ($settings?->crm_destination ?? 'qualified_pipeline'));

        return in_array($destination, ['qualified_pipeline', 'human_review'], true)
            ? $destination
            : 'qualified_pipeline';
    }

    /**
     * @return array{status?: string, pipeline_stage?: string}
     */
    private function crmPushOptions(Organization $organization, SocialSignal $signal): array
    {
        $destination = $this->resolveCrmDestination($organization, $signal);

        return match ($destination) {
            'human_review' => [
                'status' => 'new_lead',
                'pipeline_stage' => 'human_review',
            ],
            default => [
                'status' => 'qualified',
                'pipeline_stage' => 'qualified_pipeline',
            ],
        };
    }
}
