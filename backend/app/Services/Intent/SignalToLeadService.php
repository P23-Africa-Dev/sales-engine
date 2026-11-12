<?php

namespace App\Services\Intent;

use App\Models\Company;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\EnrichmentUsageTracker;
use App\Services\Enrichment\HunterEmailVerifier;
use App\Services\Enrichment\LeadProfileEnrichmentService;
use App\Services\Integrations\Factory23\CrmSyncService;

class SignalToLeadService
{
    /** A named person with their own email or phone. */
    public const CONTACT_ENRICHED = 'enriched';

    /** Only the company's inbox and/or line. */
    public const CONTACT_COMPANY_ONLY = 'company_only';

    public const CONTACT_NONE = 'no_contact_found';

    public function __construct(
        private readonly CrmSyncService $crmSync,
        private readonly ContactEnrichmentOrchestrator $contactOrchestrator,
        private readonly LeadProfileEnrichmentService $profileEnrichment,
        private readonly HunterEmailVerifier $emailVerifier,
        private readonly EnrichmentUsageTracker $usageTracker = new EnrichmentUsageTracker,
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
            'lead_type' => $isIndividual ? 'individual' : 'business',
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

        $alreadyEnriched = in_array($signal->enrichment_status, [
            SocialSignal::ENRICHMENT_ATTEMPTED_FOUND,
            SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND,
        ], true);

        if ($pushCrm && ! $alreadyEnriched) {
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

    /**
     * Stage 3 without CRM: log a found / not-found attempt on the signal itself.
     */
    public function enrichSignalOnly(SocialSignal $signal, Organization $organization): SocialSignal
    {
        if (in_array($signal->enrichment_status, [
            SocialSignal::ENRICHMENT_ATTEMPTED_FOUND,
            SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND,
        ], true)) {
            return $signal;
        }

        $signal->loadMissing('icpProfile');
        $isIndividual = $this->isIndividualPoster($signal);
        $this->enrichContactsIntoMeta($organization, $signal, null, [], $isIndividual);

        return $signal->fresh() ?? $signal;
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
     * Stage 3: one best contact per signal, in priority order:
     * (a) the person named in the event (for a leadership hire, the appointee);
     * (b) otherwise someone in the target roles, found by a company-verified lookup;
     * (c) otherwise the company's own inbox and phone.
     * Every named person still gets an attempt logged. The chosen contact (email checked with
     * Hunter when configured) lands in signal meta as `contact` / `contact_status`, and
     * `$signal->enrichment_status` always ends up in a defined state.
     *
     * @param  array<string, mixed>  $leadMeta
     * @return array<string, mixed>
     */
    private function enrichContactsIntoMeta(
        Organization $organization,
        SocialSignal $signal,
        ?Lead $lead,
        array $leadMeta,
        bool $isIndividual,
    ): array {
        $company = ! $isIndividual
            ? trim((string) ($signal->company_name ?? ''))
            : trim((string) ($leadMeta['company'] ?? ''));
        if (mb_strtolower($company) === 'individual') {
            $company = '';
        }
        $location = $this->nonEmpty($signal->location_text);

        $namedPeople = $this->resolveNamedPeople($signal);
        $attempted = false;
        $otherPersonFound = false;
        /** @var array{name: ?string, role: ?string, linkedin_url: ?string, result: array<string, mixed>, is_person: bool}|null $chosen */
        $chosen = null;

        if ($namedPeople !== []) {
            $first = null;
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
                            'location' => $location,
                            'website' => $this->companyWebsite($signal),
                            // The outlet or job board that published the signal never stands in for the company.
                            'exclude_hosts' => array_filter([$signal->post_url]),
                        ]),
                        [],
                        $lead?->id,
                        $signal->id,
                        $index,
                    );
                } catch (\Throwable $e) {
                    $this->logFailedAttempt($organization, $signal, $lead, $personName, $e, $index);

                    continue;
                }

                $candidate = [
                    'name' => $personName,
                    'role' => $this->evidencedRole($signal, $personName, $enriched),
                    'linkedin_url' => $this->nonEmpty($enriched['linkedin_url'] ?? null)
                        ?? ($index === 0 ? $this->nonEmpty($leadMeta['linkedin_url'] ?? null) : null),
                    'result' => $enriched,
                    'is_person' => true,
                ];
                $first ??= $candidate;

                if ($chosen === null && $this->hasPersonalChannel($enriched)) {
                    $chosen = $candidate;
                } elseif (($enriched['email'] ?? '') !== '' || ($enriched['phone'] ?? '') !== '') {
                    $otherPersonFound = true;
                }
            }
            $chosen ??= $first;
        } elseif ($company !== '') {
            $attempted = true;
            $rolePerson = $this->findTargetRolePerson($organization, $signal, $company);
            $personName = $rolePerson['name'] ?? '';

            try {
                // With nobody found in the target roles this runs in company mode: inbox + line.
                $enriched = $this->contactOrchestrator->enrichContacts(
                    $organization,
                    $personName,
                    array_filter([
                        'company' => $company,
                        'linkedin_url' => $rolePerson['linkedin_url'] ?? null,
                        'location' => $location,
                        'website' => $this->companyWebsite($signal),
                        // The outlet or job board that published the signal never stands in for the company.
                        'exclude_hosts' => array_filter([$signal->post_url]),
                    ]),
                    [],
                    $lead?->id,
                    $signal->id,
                );
                $chosen = [
                    'name' => $rolePerson['name'] ?? null,
                    'role' => $rolePerson['title'] ?? null,
                    'linkedin_url' => $rolePerson['linkedin_url'] ?? null,
                    'result' => $enriched,
                    'is_person' => $rolePerson !== null,
                ];
            } catch (\Throwable $e) {
                $this->logFailedAttempt($organization, $signal, $lead, $personName !== '' ? $personName : $company, $e, 0);
            }
        }

        if (! $attempted && $lead !== null) {
            return $leadMeta;
        }

        [$contact, $contactStatus, $droppedEmail] = $this->resolveBestContact($organization, $signal, $chosen);

        if ($chosen !== null) {
            $result = $chosen['result'];
            if ($droppedEmail !== null && mb_strtolower((string) ($result['email'] ?? '')) === $droppedEmail) {
                $result['email'] = '';
            }
            if ($chosen['is_person'] && $chosen['role'] !== null) {
                $result['title'] = $chosen['role'];
            }
            $leadMeta = $this->mergeEnrichedIntoLeadMeta($leadMeta, $result);
            if (! $isIndividual && $chosen['is_person'] && $chosen['name'] !== null) {
                $leadMeta['contact_person'] = $chosen['name'];
            }
        }

        $signalMeta = $signal->fresh()?->meta;
        $signalMeta = is_array($signalMeta) ? $signalMeta : [];
        $signalMeta['contact'] = $contact;
        $signalMeta['contact_status'] = $contactStatus;

        $signal->update([
            'meta' => $signalMeta,
            'enrichment_status' => $contactStatus !== self::CONTACT_NONE || $otherPersonFound
                ? SocialSignal::ENRICHMENT_ATTEMPTED_FOUND
                : SocialSignal::ENRICHMENT_ATTEMPTED_NOT_FOUND,
            'enrichment_attempted_at' => now(),
        ]);

        return $leadMeta;
    }

    private function logFailedAttempt(Organization $organization, SocialSignal $signal, ?Lead $lead, string $subject, \Throwable $e, int $index): void
    {
        $this->usageTracker->logEnrichment(
            $organization,
            'error',
            'contact_enrichment',
            false,
            false,
            0,
            $subject,
            $lead?->id,
            ['outcome' => 'not_found', 'error' => $e->getMessage()],
            $signal->id,
            $index,
        );
    }

    /**
     * Builds `meta.contact` from the chosen candidate and checks its one email with Hunter.
     * An email Hunter calls invalid is dropped and the status worked out again without it.
     *
     * @param  array{name: ?string, role: ?string, linkedin_url: ?string, result: array<string, mixed>, is_person: bool}|null  $chosen
     * @return array{0: ?array<string, ?string>, 1: string, 2: ?string}
     */
    private function resolveBestContact(Organization $organization, SocialSignal $signal, ?array $chosen): array
    {
        if ($chosen === null) {
            return [null, self::CONTACT_NONE, null];
        }

        [$contact, $status, $emailSource] = $this->buildContact($signal, $chosen, null);
        if ($contact === null || $contact['email'] === null) {
            return [$contact, $status, null];
        }

        $verdict = $this->emailVerifier->verify($organization, $contact['email'], $chosen['name'], $signal->id);
        if ($verdict !== HunterEmailVerifier::STATUS_INVALID) {
            $contact['email_status'] = $verdict ?? $this->contactOrchestrator->emailStatusFor($emailSource);

            return [$contact, $status, null];
        }

        // Hunter says the mailbox does not exist: drop it. Only one address is ever checked,
        // so a company inbox that takes its place keeps its unverified status.
        $droppedEmail = mb_strtolower($contact['email']);
        [$contact, $status, $emailSource] = $this->buildContact($signal, $chosen, $droppedEmail);
        if ($contact !== null && $contact['email'] !== null) {
            $contact['email_status'] = $this->contactOrchestrator->emailStatusFor($emailSource);
        }

        return [$contact, $status, $droppedEmail];
    }

    /**
     * enriched = a named person with their own email or phone; company_only = only the
     * company's inbox / line; no_contact_found = neither. Nothing is invented: every value
     * comes from the enrichment result or the lookup that found the person.
     *
     * @param  array{name: ?string, role: ?string, linkedin_url: ?string, result: array<string, mixed>, is_person: bool}  $chosen
     * @return array{0: ?array{name: ?string, role: ?string, email: ?string, email_status: ?string, phone: ?string, linkedin_url: ?string, source_url: ?string, confidence: ?string}, 1: string, 2: ?array<string, mixed>}
     */
    private function buildContact(SocialSignal $signal, array $chosen, ?string $excludedEmail): array
    {
        $result = $chosen['result'];
        $sources = is_array($result['contact_sources'] ?? null) ? $result['contact_sources'] : [];
        $usable = fn (?string $email): ?string => $email !== null && mb_strtolower($email) !== $excludedEmail ? $email : null;

        $email = null;
        $phone = null;
        $emailSource = null;
        $phoneSource = null;
        $status = self::CONTACT_NONE;

        if ($chosen['is_person']) {
            $personalEmail = $usable($this->personalChannel($result, $sources, 'email'));
            $personalPhone = $this->personalChannel($result, $sources, 'phone');
            if ($personalEmail !== null || $personalPhone !== null) {
                $status = self::CONTACT_ENRICHED;
                $email = $personalEmail;
                $phone = $personalPhone;
                $emailSource = $personalEmail !== null ? ($sources['email'] ?? null) : null;
                $phoneSource = $personalPhone !== null ? ($sources['phone'] ?? null) : null;
            }
        }

        if ($status === self::CONTACT_NONE) {
            $companyEmail = $usable($this->nonEmpty($result['company_email'] ?? null));
            $companyPhone = $this->nonEmpty($result['company_phone'] ?? null);
            $emailSource = $companyEmail !== null ? ($sources['company_email'] ?? null) : null;
            $phoneSource = $companyPhone !== null ? ($sources['company_phone'] ?? null) : null;

            if (! $chosen['is_person']) {
                // Company mode: the orchestrator also puts the company inbox / line in email / phone.
                $modeEmail = $usable($this->nonEmpty($result['email'] ?? null));
                if ($companyEmail === null && $modeEmail !== null) {
                    $companyEmail = $modeEmail;
                    $emailSource = $sources['email'] ?? null;
                }
                $modePhone = $this->nonEmpty($result['phone'] ?? null);
                if ($companyPhone === null && $modePhone !== null) {
                    $companyPhone = $modePhone;
                    $phoneSource = $sources['phone'] ?? null;
                }
            }

            if ($companyEmail !== null || $companyPhone !== null) {
                $status = self::CONTACT_COMPANY_ONLY;
                $email = $companyEmail;
                $phone = $companyPhone;
            }
        }

        $name = $chosen['is_person'] ? $chosen['name'] : null;
        if ($name === null && $status === self::CONTACT_NONE) {
            return [null, self::CONTACT_NONE, null];
        }

        $emailSource = is_array($emailSource) ? $emailSource : null;
        $phoneSource = is_array($phoneSource) ? $phoneSource : null;

        return [[
            'name' => $name,
            'role' => $chosen['is_person'] ? $chosen['role'] : null,
            'email' => $email,
            'email_status' => null,
            'phone' => $phone,
            'linkedin_url' => $chosen['is_person'] ? $chosen['linkedin_url'] : null,
            'source_url' => $this->nonEmpty($emailSource['source_url'] ?? null)
                ?? $this->nonEmpty($phoneSource['source_url'] ?? null)
                ?? ($chosen['is_person'] ? $chosen['linkedin_url'] : null)
                ?? $this->nonEmpty($signal->post_url),
            'confidence' => $this->nonEmpty($emailSource['confidence'] ?? null) ?? $this->nonEmpty($phoneSource['confidence'] ?? null),
        ], $status, $emailSource];
    }

    /**
     * The person's own email / phone: a value whose source is `direct`. A company line the
     * orchestrator copied into `phone` as a fallback is not theirs. Results without
     * contact_sources (older providers) count as the person's own.
     *
     * @param  array<string, mixed>  $result
     * @param  array<string, mixed>  $sources
     */
    private function personalChannel(array $result, array $sources, string $channel): ?string
    {
        $value = $this->nonEmpty($result[$channel] ?? null);
        if ($value === null) {
            return null;
        }

        $type = $sources[$channel]['type'] ?? null;

        return $type === null || $type === 'direct' ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function hasPersonalChannel(array $result): bool
    {
        $sources = is_array($result['contact_sources'] ?? null) ? $result['contact_sources'] : [];

        return $this->personalChannel($result, $sources, 'email') !== null
            || $this->personalChannel($result, $sources, 'phone') !== null;
    }

    /**
     * A role only with evidence for it: the enrichment result, or the poster's own stated
     * persona when the named person is the poster. Never the ICP's wished-for roles.
     *
     * @param  array<string, mixed>  $enriched
     */
    private function evidencedRole(SocialSignal $signal, string $personName, array $enriched): ?string
    {
        $title = $this->nonEmpty($enriched['title'] ?? null);
        if ($title !== null) {
            return $title;
        }

        // The event itself often states it: "appointed Cyril Clement as Country Manager".
        $fromEvent = $this->roleStatedInEvent($signal, $personName);
        if ($fromEvent !== null) {
            return $fromEvent;
        }

        $isPoster = mb_strtolower(trim((string) $signal->profile_name)) === mb_strtolower($personName);

        return $isPoster ? $this->nonEmpty($signal->persona) : null;
    }

    /**
     * "X appoints Jane Doe as Country Manager", "Jane Doe, the new Managing Director",
     * "Jane Doe has been named Head of Sales".
     */
    private function roleStatedInEvent(SocialSignal $signal, string $personName): ?string
    {
        $text = trim((string) $signal->summary.' '.$signal->post_text);
        if ($text === '' || $personName === '') {
            return null;
        }

        $name = preg_quote($personName, '/');
        $role = '([A-Z][A-Za-z&\/\- ]{2,60}?)';
        $patterns = [
            '/'.$name.'\s+(?:as|to the role of|to the post of)\s+(?:its\s+|the\s+|new\s+)*'.$role.'(?=\s*(?:[.,;]|\bfor\b|\bof\b|\bat\b|\bin\b|$))/u',
            '/'.$name.',\s+(?:the\s+)?(?:new(?:ly appointed)?\s+)?'.$role.'(?=\s*(?:[.,;]|\bfor\b|\bof\b|\bat\b|\bin\b|$))/u',
            '/'.$name.'\s+(?:has been|was|is)\s+(?:appointed|named)\s+(?:as\s+)?(?:the\s+)?(?:new\s+)?'.$role.'(?=\s*(?:[.,;]|\bfor\b|\bof\b|\bat\b|\bin\b|$))/u',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $match) && preg_match('/\b(?:manager|director|head|chief|officer|president|lead|partner|ceo|cfo|coo|cto|md)\b/i', $match[1])) {
                return trim($match[1]);
            }
        }

        return null;
    }

    /**
     * Someone in the target roles who the search results show actually works at the company
     * (other firms' people are rejected and titles are never guessed). The contact waterfall
     * is deferred: the orchestrator finds their contacts afterwards.
     *
     * @return array{name: string, title: ?string, linkedin_url: ?string}|null
     */
    private function findTargetRolePerson(Organization $organization, SocialSignal $signal, string $company): ?array
    {
        $icp = $signal->icpProfile;
        if (! $icp instanceof IcpProfile) {
            return null;
        }

        $brief = IcpBrief::fromIcpProfile($icp);
        $roles = $this->targetRolesForSignal($signal);
        if ($roles !== [] && $roles !== $brief->decisionMakers) {
            $brief = new IcpBrief(...array_merge(get_object_vars($brief), ['decisionMakers' => $roles]));
        }

        $this->profileEnrichment->setDeferContactWaterfall(true);
        try {
            $found = $this->profileEnrichment->enrichCompanyDecisionMaker($organization, $icp, $company, $brief, ['company' => $company]);
        } catch (\Throwable $e) {
            $this->usageTracker->logEnrichment(
                $organization,
                'error',
                'decision_maker_lookup',
                false,
                false,
                0,
                $company,
                null,
                ['outcome' => 'not_found', 'error' => $e->getMessage()],
                $signal->id,
            );

            return null;
        } finally {
            $this->profileEnrichment->setDeferContactWaterfall(false);
        }

        $name = $this->nonEmpty($found['contact_person'] ?? null);
        $title = $this->nonEmpty($found['title'] ?? null);
        // Someone found by a role search counts only when a source states their role at this
        // company; a bare name next to a big company's name is too often someone else.
        if ($name === null || $title === null) {
            return null;
        }

        return [
            'name' => $name,
            'title' => $title,
            'linkedin_url' => $this->nonEmpty($found['linkedin_url'] ?? null),
        ];
    }

    /**
     * The company's own site from the company check, when one was found.
     */
    private function companyWebsite(SocialSignal $signal): ?string
    {
        $profile = is_array($signal->meta['firmographics'] ?? null) ? $signal->meta['firmographics'] : [];

        return $this->nonEmpty($profile['website'] ?? null);
    }

    private function nonEmpty(mixed $value): ?string
    {
        $value = is_scalar($value) ? trim((string) $value) : '';

        return $value !== '' ? $value : null;
    }

    /**
     * @return list<string>
     */
    private function resolveNamedPeople(SocialSignal $signal): array
    {
        $publisher = $this->publisherNames($signal);
        $named = is_array($signal->named_people) ? $signal->named_people : [];
        $named = array_values(array_filter(
            array_map(static fn ($n) => trim((string) $n), $named),
            fn ($n) => $this->looksLikeARealName($n) && ! in_array(mb_strtolower($n), $publisher, true),
        ));

        if ($named !== []) {
            return $named;
        }

        // A company event (news story, job post, announcement) is posted by an outlet or job
        // board, not by someone at the company: only people the event itself names count.
        if ($signal->signal_type_key !== null) {
            return [];
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

        // Publications and outlets ("Engineering News", "Ghana Business News") are not people.
        return $normalized !== ''
            && ! in_array($normalized, ['unknown', 'social prospect'], true)
            && ! preg_match('/\b(?:news|media|magazine|journal|times|daily|press|tv|radio|blog|post|tribune|gazette|reporter|online|network|group|ltd|limited|inc)\b/u', $normalized);
    }

    /**
     * Names of whoever published the post (outlet, job board, poster) in lower case.
     *
     * @return list<string>
     */
    private function publisherNames(SocialSignal $signal): array
    {
        $meta = is_array($signal->meta) ? $signal->meta : [];
        $label = (string) $signal->source_label;

        return array_values(array_filter(array_map(
            static fn ($value): string => mb_strtolower(trim((string) $value)),
            [$meta['author_name'] ?? null, $signal->profile_name, str_contains($label, '·') ? explode('·', $label, 2)[1] : null],
        )));
    }

    /**
     * Roles for the people lookup: the signal type's own `target_roles` when its definition
     * sets them (they override the ICP), otherwise the ICP's decision makers.
     *
     * @return list<string>
     */
    private function targetRolesForSignal(SocialSignal $signal): array
    {
        $config = is_array($signal->icpProfile?->config) ? $signal->icpProfile->config : [];
        $roles = $this->signalTypeTargetRoles($signal);
        if (array_filter($roles, static fn (string $role) => trim($role) !== '') === []) {
            $roles = array_map('strval', $config['decisionMakers'] ?? []);
        }

        return array_values(array_unique(array_filter(
            array_map('trim', $roles),
            static fn (string $role) => $role !== '',
        )));
    }

    /**
     * @return list<string>
     */
    private function signalTypeTargetRoles(SocialSignal $signal): array
    {
        $key = trim((string) ($signal->signal_type_key ?? ''));
        if ($key === '') {
            return [];
        }

        $definition = SignalTypeDefinition::query()
            ->where('key', $key)
            ->where(fn ($query) => $query->where('organization_id', $signal->organization_id)->orWhereNull('organization_id'))
            ->orderByRaw('organization_id is null')
            ->first();

        $raw = $definition?->getAttribute('target_roles');
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : explode(',', $raw);
        }

        return is_array($raw) ? array_values(array_map('strval', array_filter($raw, 'is_scalar'))) : [];
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
