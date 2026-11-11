<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use App\Services\Discovery\DiscoveryGeo;

/**
 * Open-web first contact waterfall. Paid providers only fill what the free
 * tiers could not:
 *
 * seed → Serper snippets (tier1) → company website crawl → Serper contact
 * search → Serper Places → email pattern inference → Bytemine/Cleanlist →
 * Apollo → Hunter.
 *
 * @phpstan-type ContactSource array{value: string, type: string, method: string, source_url: ?string, confidence: string}
 */
class ContactEnrichmentOrchestrator
{
    /**
     * Company mailboxes that are useless for outreach.
     */
    private const UNUSABLE_GENERIC_LOCALS = [
        'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'privacy', 'abuse', 'postmaster', 'webmaster',
        'hostmaster', 'legal', 'jobs', 'careers', 'recruitment', 'hr', 'press', 'media', 'newsletter', 'compliance',
    ];

    /**
     * Preferred company mailboxes for a business lead, best first.
     */
    private const PREFERRED_GENERIC_LOCALS = ['sales', 'info', 'contact', 'hello', 'enquiries', 'inquiries', 'business', 'office'];

    /** Judgement context for the lead being enriched (set per enrichContacts call). */
    private ?string $gateDomain = null;

    private ?string $gateCountry = null;

    private string $gatePerson = '';

    public function __construct(
        private readonly SnippetContactExtractor $snippetExtractor,
        private readonly BytemineEnricher $bytemine,
        private readonly CleanlistEnricher $cleanlist,
        private readonly ApolloPersonEnricher $apollo,
        private readonly HunterEmailEnricher $hunter,
        private readonly EnrichmentUsageTracker $usageTracker,
        private readonly DomainResolver $domainResolver,
        private readonly WebsiteContactCrawler $crawler,
        private readonly SerperContactSearch $contactSearch,
        private readonly SerperPlacesLookup $places,
        private readonly EmailPatternInferer $patternInferer,
        private readonly PhoneNumberNormalizer $phoneNormalizer,
        private readonly ContactTextExtractor $text,
        private readonly DiscoveryGeo $geo,
    ) {}

    /**
     * Pass an empty $personName (or the company name) for a business lead:
     * generic mailboxes then become the lead's email.
     *
     * @param  array{email?: ?string, phone?: ?string, company?: ?string, website?: ?string, linkedin_url?: ?string, profile_urls?: list<string>, location?: ?string}  $seed
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     * @return array{
     *     email: string,
     *     phone: string,
     *     linkedin_url: string,
     *     title: string,
     *     company_name: string,
     *     tier: ?string,
     *     provider: ?string,
     *     company_email: string,
     *     company_phone: string,
     *     domain: ?string,
     *     address: string,
     *     contact_sources: array<string, ContactSource>
     * }
     */
    public function enrichContacts(
        Organization $organization,
        string $personName,
        array $seed = [],
        array $snippets = [],
        ?int $leadId = null,
        ?int $socialSignalId = null,
        int $personIndex = 0,
    ): array {
        $personName = trim($personName);
        $company = trim((string) ($seed['company'] ?? ''));
        $company = $company !== '' ? $company : null;
        $isCompanyLead = $personName === '' || ($company !== null && mb_strtolower($personName) === mb_strtolower($company));
        $country = $this->phoneNormalizer->countryFromLocation(isset($seed['location']) ? (string) $seed['location'] : null);

        $contacts = [
            'email' => '',
            'phone' => '',
            'linkedin_url' => trim((string) ($seed['linkedin_url'] ?? ($seed['profile_urls'][0] ?? ''))),
            'title' => '',
            'company_name' => $company ?? '',
            'tier' => null,
            'provider' => null,
            'company_email' => '',
            'company_phone' => '',
            'domain' => null,
            'address' => '',
            'contact_sources' => [],
        ];

        $logContext = [$organization, $personName !== '' ? $personName : ($company ?? ''), $leadId, $socialSignalId, $personIndex];

        // Resolve the company domain first: every email below is judged against it.
        $location = isset($seed['location']) ? (string) $seed['location'] : null;
        $domain = $this->domainResolver->resolve($seed['website'] ?? null, $company, $snippets, $location);
        $contacts['domain'] = $domain;
        $country ??= $this->countryFromDomain($domain);
        $this->gateDomain = $domain;
        $this->gateCountry = $country;
        $this->gatePerson = $isCompanyLead ? '' : $personName;

        $this->acceptEmail($contacts, (string) ($seed['email'] ?? ''), $isCompanyLead, $personName, 'seed', null, 'snippet', 'seed', 'existing');
        $this->acceptPhone($contacts, (string) ($seed['phone'] ?? ''), $isCompanyLead ? 'company_line' : 'direct', 'seed', null, 'snippet', $country, 'seed', 'existing');

        if ($this->hasCompleteContacts($contacts)) {
            $this->log($logContext, 'seed', 'existing', $contacts['email'] !== '', $contacts['phone'] !== '', 0, ['outcome' => 'found']);

            return $this->finalize($contacts);
        }

        $loggedAttempt = false;

        // Tier 1 — Serper snippets already in hand (+ GLM when configured).
        $snippetSubject = $personName !== '' ? $personName : ($company ?? '');
        if ($snippets !== [] && $snippetSubject !== '') {
            $tier1 = $this->snippetExtractor->extractFromSnippets($organization, $snippetSubject, $company, $snippets);
            $sourceUrl = $this->snippetSourceUrl($snippets, $tier1);
            $foundEmail = $this->acceptEmail($contacts, (string) ($tier1['email'] ?? ''), $isCompanyLead, $personName, 'serper_snippet', $sourceUrl, 'snippet', 'tier1', 'snippet_extractor');
            $foundPhone = $this->acceptPhone($contacts, (string) ($tier1['phone'] ?? ''), $isCompanyLead ? 'company_line' : 'direct', 'serper_snippet', $sourceUrl, 'snippet', $country, 'tier1', 'snippet_extractor');
            if ($contacts['linkedin_url'] === '' && ($tier1['linkedin_url'] ?? '') !== '') {
                $contacts['linkedin_url'] = (string) $tier1['linkedin_url'];
            }
            $this->log($logContext, 'tier1', 'snippet_extractor', $foundEmail, $foundPhone);
            $loggedAttempt = true;

            if ($this->hasCompleteContacts($contacts)) {
                return $this->finalize($contacts);
            }
        }

        /** @var list<array{email: string, name?: ?string}> $knownDomainEmails */
        $knownDomainEmails = [];

        // Company website crawl (free).
        if ($domain !== null && $this->needsMore($contacts)) {
            [$foundEmail, $foundPhone] = $this->applyCrawl($contacts, $this->crawler->crawl($domain), $isCompanyLead, $personName, $country, $knownDomainEmails);
            $this->log($logContext, 'website', 'website_crawler', $foundEmail, $foundPhone);
            $loggedAttempt = true;
        }

        // Serper contact search (free-ish, already paid for discovery).
        if ($this->contactSearch->isEnabled() && $this->needsMore($contacts) && ($domain !== null || $company !== null)) {
            $search = $this->contactSearch->search($organization, $domain, $company, $isCompanyLead ? null : $personName);
            [$foundEmail, $foundPhone] = $this->applySearch($contacts, $search, $isCompanyLead, $personName, $country, $knownDomainEmails);
            $this->log($logContext, 'web_search', 'serper_contact_search', $foundEmail, $foundPhone, 0, ['queries' => $search['queries']]);
            $loggedAttempt = true;
        }

        // Serper Places — company phone/website/address.
        if ($this->places->isEnabled() && $company !== null && ($domain === null || ($contacts['phone'] === '' && $contacts['company_phone'] === ''))) {
            $place = $this->places->lookup($company, $location);
            $foundPhone = false;
            $foundEmail = false;
            if ($place !== null) {
                $foundPhone = $this->acceptCompanyPhone($contacts, (string) ($place['phone'] ?? ''), 'serper_places', $place['source_url'], 'snippet', $country, 'places', 'serper_places', $isCompanyLead);
                if ($contacts['address'] === '' && ($place['address'] ?? null) !== null) {
                    $contacts['address'] = (string) $place['address'];
                }
                $placeDomain = $this->domainResolver->hostFrom($place['website'] ?? null);
                if ($domain === null && $placeDomain !== null && ! $this->domainResolver->isNonCompanyHost($placeDomain)) {
                    $domain = $placeDomain;
                    $contacts['domain'] = $domain;
                    $country ??= $this->countryFromDomain($domain);
                    $this->gateDomain = $domain;
                    $this->gateCountry ??= $country;
                    [$crawlEmail, $crawlPhone] = $this->applyCrawl($contacts, $this->crawler->crawl($domain), $isCompanyLead, $personName, $country, $knownDomainEmails);
                    $foundEmail = $crawlEmail;
                    $foundPhone = $foundPhone || $crawlPhone;
                }
            }
            $this->log($logContext, 'places', 'serper_places', $foundEmail, $foundPhone);
            $loggedAttempt = true;
        }

        // Email pattern inference from personal mailboxes seen on the domain.
        if (! $isCompanyLead && $contacts['email'] === '' && $domain !== null && $knownDomainEmails !== []) {
            $inferred = $this->patternInferer->infer($personName, $domain, $knownDomainEmails);
            $found = false;
            if ($inferred !== null) {
                $found = $this->setEmail($contacts, $inferred['email'], 'direct', 'pattern_inference', null, 'pattern', 'pattern', 'email_pattern');
            }
            $this->log($logContext, 'pattern', 'email_pattern', $found, false, 0, $inferred !== null ? ['pattern' => $inferred['pattern']] : []);
            $loggedAttempt = true;
        }

        // Paid tiers — only when configured, a person is named and the email is still missing.
        if (! $isCompanyLead) {
            $loggedAttempt = $this->runPaidTiers($contacts, $organization, $personName, $company, $domain, $seed, $country, $logContext) || $loggedAttempt;
        }

        if (! $loggedAttempt) {
            $this->log($logContext, 'none', 'unavailable', false, false, 0, ['outcome' => 'not_found']);
        }

        return $this->finalize($contacts);
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    public function hasCompleteContacts(array $contacts): bool
    {
        return trim((string) ($contacts['email'] ?? '')) !== ''
            && trim((string) ($contacts['phone'] ?? '')) !== '';
    }

    /**
     * @param  array<string, mixed>  $contacts
     * @param  array<string, mixed>  $seed
     * @param  array{0: Organization, 1: string, 2: ?int, 3: ?int, 4: int}  $logContext
     */
    private function runPaidTiers(
        array &$contacts,
        Organization $organization,
        string $personName,
        ?string $company,
        ?string $domain,
        array $seed,
        ?string $country,
        array $logContext,
    ): bool {
        $logged = false;
        $context = array_filter([
            'company' => $company,
            'website' => isset($seed['website']) ? (string) $seed['website'] : null,
            'linkedin_url' => $contacts['linkedin_url'] !== '' ? $contacts['linkedin_url'] : null,
            'domain' => $domain,
        ], fn ($value) => is_string($value) && $value !== '');

        foreach (['bytemine' => $this->bytemine, 'cleanlist' => $this->cleanlist] as $name => $provider) {
            if ($contacts['email'] !== '' || ! $provider->isEnabled()) {
                continue;
            }

            $result = $provider->enrichPerson($organization, $personName, $context);
            [$foundEmail, $foundPhone] = $this->mergeProvider($contacts, $result, 'tier2', $name, $country);
            $this->log($logContext, 'tier2', $name, $foundEmail, $foundPhone, (int) ($result['credits_used'] ?? 0));
            $logged = true;
            if (($result['linkedin_url'] ?? '') !== '') {
                $context['linkedin_url'] = (string) $result['linkedin_url'];
            }
        }

        if ($contacts['email'] === '' && $this->apollo->isEnabled()) {
            $result = $this->apollo->enrich($organization, $personName, $company);
            [$foundEmail, $foundPhone] = $this->mergeProvider($contacts, $result, 'tier3', 'apollo', $country);
            $this->log($logContext, 'tier3', 'apollo', $foundEmail, $foundPhone, $foundEmail || $foundPhone ? 1 : 0);
            $logged = true;

            if ($domain === null && ($result['company_name'] ?? '') !== '') {
                $domain = $this->domainResolver->resolve(null, (string) $result['company_name']);
                $contacts['domain'] ??= $domain;
            }
        }

        if ($contacts['email'] === '' && $domain !== null && $this->hunter->isEnabled()) {
            $found = $this->hunter->findEmail($personName, $domain);
            $foundEmail = $found !== null && $this->setEmail($contacts, $found, 'direct', 'hunter', null, 'provider', 'tier3', 'hunter');
            $this->log($logContext, 'tier3', 'hunter', $foundEmail, false, $foundEmail ? 1 : 0);
            $logged = true;
        }

        return $logged;
    }

    /**
     * @param  array<string, mixed>  $contacts
     * @param  array<string, mixed>  $crawl
     * @param  list<array{email: string, name?: ?string}>  $knownDomainEmails
     * @return array{0: bool, 1: bool}
     */
    private function applyCrawl(array &$contacts, array $crawl, bool $isCompanyLead, string $personName, ?string $country, array &$knownDomainEmails): array
    {
        $domain = (string) ($crawl['domain'] ?? '');
        $foundEmail = false;
        $foundPhone = false;

        foreach ((array) ($crawl['emails'] ?? []) as $email) {
            if ($this->text->isOnDomain($email['value'], $domain) && ! $this->text->isGenericEmail($email['value'])) {
                $knownDomainEmails[] = ['email' => $email['value'], 'name' => $email['name'] ?? null];
            }
        }

        if (! $isCompanyLead) {
            foreach ((array) ($crawl['people'] ?? []) as $person) {
                if (! $this->samePerson((string) $person['name'], $personName)) {
                    continue;
                }
                if ($contacts['title'] === '' && trim((string) $person['title']) !== '') {
                    $contacts['title'] = trim((string) $person['title']);
                }
                if (($person['email'] ?? null) !== null && ! $this->text->isGenericEmail($person['email'])) {
                    $foundEmail = $this->setEmail($contacts, $person['email'], 'direct', 'website_crawl', $person['source_url'], 'on_page', 'website', 'website_crawler') || $foundEmail;
                }
                if (($person['phone'] ?? null) !== null) {
                    $foundPhone = $this->setPhone($contacts, $person['phone'], 'direct', 'website_crawl', $person['source_url'], 'on_page', $country, 'website', 'website_crawler') || $foundPhone;
                }
            }

            foreach ((array) ($crawl['emails'] ?? []) as $email) {
                if (! $this->text->isGenericEmail($email['value'])
                    && ($this->text->emailMatchesPerson($email['value'], $personName) || $this->samePerson((string) ($email['name'] ?? ''), $personName))) {
                    $foundEmail = $this->setEmail($contacts, $email['value'], 'direct', 'website_crawl', $email['source_url'], 'on_page', 'website', 'website_crawler') || $foundEmail;
                }
            }
        }

        $companyEmail = $this->bestCompanyEmail((array) ($crawl['emails'] ?? []), $domain, $isCompanyLead);
        if ($companyEmail !== null) {
            $foundEmail = $this->acceptCompanyEmail($contacts, $companyEmail['value'], 'website_crawl', $companyEmail['source_url'], 'on_page', 'website', 'website_crawler', $isCompanyLead) || $foundEmail;
        }

        $phone = $crawl['phones'][0] ?? null;
        if (is_array($phone)) {
            $foundPhone = $this->acceptCompanyPhone($contacts, (string) $phone['value'], 'website_crawl', $phone['source_url'], 'on_page', $country, 'website', 'website_crawler', $isCompanyLead) || $foundPhone;
        }

        if ($contacts['address'] === '' && ($crawl['addresses'][0] ?? null) !== null) {
            $contacts['address'] = (string) $crawl['addresses'][0];
        }

        return [$foundEmail, $foundPhone];
    }

    /**
     * @param  array<string, mixed>  $contacts
     * @param  array<string, mixed>  $search
     * @param  list<array{email: string, name?: ?string}>  $knownDomainEmails
     * @return array{0: bool, 1: bool}
     */
    private function applySearch(array &$contacts, array $search, bool $isCompanyLead, string $personName, ?string $country, array &$knownDomainEmails): array
    {
        $foundEmail = false;
        $foundPhone = false;

        if (! $isCompanyLead && is_array($search['person_email'] ?? null)) {
            $foundEmail = $this->setEmail($contacts, $search['person_email']['value'], 'direct', 'serper_search', $search['person_email']['source_url'], 'snippet', 'web_search', 'serper_contact_search');
        }
        if (! $isCompanyLead && is_array($search['person_phone'] ?? null)) {
            $foundPhone = $this->setPhone($contacts, $search['person_phone']['value'], 'direct', 'serper_search', $search['person_phone']['source_url'], 'snippet', $country, 'web_search', 'serper_contact_search');
        }

        $domainEmails = (array) ($search['domain_emails'] ?? []);
        foreach ($domainEmails as $email) {
            if (! $this->text->isGenericEmail($email['value'])) {
                $knownDomainEmails[] = ['email' => $email['value'], 'name' => null];
            }
        }

        $companyEmail = $this->bestCompanyEmail(array_map(fn (array $email): array => $email + ['name' => null], $domainEmails), $contacts['domain'] ?? null, $isCompanyLead);
        if ($companyEmail !== null) {
            $foundEmail = $this->acceptCompanyEmail($contacts, $companyEmail['value'], 'serper_search', $companyEmail['source_url'], 'snippet', 'web_search', 'serper_contact_search', $isCompanyLead) || $foundEmail;
        }

        $phone = $search['company_phones'][0] ?? null;
        if (is_array($phone)) {
            $foundPhone = $this->acceptCompanyPhone($contacts, (string) $phone['value'], 'serper_search', $phone['source_url'], 'snippet', $country, 'web_search', 'serper_contact_search', $isCompanyLead) || $foundPhone;
        }

        if ($contacts['linkedin_url'] === '' && filled($search['linkedin_url'] ?? null)) {
            $contacts['linkedin_url'] = (string) $search['linkedin_url'];
        }

        return [$foundEmail, $foundPhone];
    }

    /**
     * @param  array<string, mixed>  $contacts
     * @param  array<string, mixed>  $result
     * @return array{0: bool, 1: bool}
     */
    private function mergeProvider(array &$contacts, array $result, string $tier, string $provider, ?string $country): array
    {
        foreach (['linkedin_url', 'title', 'company_name'] as $key) {
            $value = trim((string) ($result[$key] ?? ''));
            if ($contacts[$key] === '' && $value !== '') {
                $contacts[$key] = $value;
            }
        }

        $email = trim((string) ($result['email'] ?? ''));
        $foundEmail = $email !== '' && ! $this->text->isGenericEmail($email)
            && $this->setEmail($contacts, $email, 'direct', $provider, null, 'provider', $tier, $provider);
        $foundPhone = $this->setPhone($contacts, (string) ($result['phone'] ?? ''), 'direct', $provider, null, 'provider', $country, $tier, $provider);

        return [$foundEmail, $foundPhone];
    }

    /**
     * Routes an email to the person (direct) or the company (generic) slot.
     *
     * @param  array<string, mixed>  $contacts
     */
    private function acceptEmail(array &$contacts, string $email, bool $isCompanyLead, string $personName, string $method, ?string $sourceUrl, string $confidence, string $tier, string $provider): bool
    {
        $email = $this->text->normalizeEmail($email);
        if ($email === null) {
            return false;
        }

        if ($this->text->isGenericEmail($email)) {
            return $this->acceptCompanyEmail($contacts, $email, $method, $sourceUrl, $confidence, $tier, $provider, $isCompanyLead);
        }

        return $this->setEmail($contacts, $email, 'direct', $method, $sourceUrl, $confidence, $tier, $provider);
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    private function acceptCompanyEmail(array &$contacts, string $email, string $method, ?string $sourceUrl, string $confidence, string $tier, string $provider, bool $isCompanyLead): bool
    {
        $email = $this->text->normalizeEmail($email);
        if ($email === null || $this->isUnusableGeneric($email) || ! $this->emailBelongsToCompany($email)) {
            return false;
        }

        $type = $this->text->isGenericEmail($email) ? 'generic' : 'direct';
        $filled = false;
        if ($contacts['company_email'] === '') {
            $contacts['company_email'] = $email;
            $contacts['contact_sources']['company_email'] = $this->source($email, $type, $method, $sourceUrl, $confidence);
            $filled = true;
        }

        if ($isCompanyLead) {
            return $this->setEmail($contacts, $email, $type, $method, $sourceUrl, $confidence, $tier, $provider) || $filled;
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    private function acceptPhone(array &$contacts, string $phone, string $type, string $method, ?string $sourceUrl, string $confidence, ?string $country, string $tier, string $provider): bool
    {
        if ($type === 'company_line') {
            return $this->acceptCompanyPhone($contacts, $phone, $method, $sourceUrl, $confidence, $country, $tier, $provider, true);
        }

        return $this->setPhone($contacts, $phone, $type, $method, $sourceUrl, $confidence, $country, $tier, $provider);
    }

    /**
     * Company line always fills company_phone; it becomes the lead phone for
     * business leads immediately and for people only as a final fallback.
     *
     * @param  array<string, mixed>  $contacts
     */
    private function acceptCompanyPhone(array &$contacts, string $phone, string $method, ?string $sourceUrl, string $confidence, ?string $country, string $tier, string $provider, bool $isCompanyLead): bool
    {
        $clean = $this->text->cleanPhone($phone);
        if ($clean === null) {
            return false;
        }

        $normalized = $this->validPhone($clean, $country);
        if ($normalized === null) {
            return false;
        }
        // A switchboard in another country is the head office, not a local line.
        $lineType = $this->phoneNormalizer->belongsToCountry($normalized, $this->gateCountry) ? 'company_line' : 'hq_line';
        $filled = false;
        if ($contacts['company_phone'] === '') {
            $contacts['company_phone'] = $normalized;
            $contacts['contact_sources']['company_phone'] = $this->source($normalized, $lineType, $method, $sourceUrl, $confidence);
            $filled = true;
            if (! $isCompanyLead && $contacts['tier'] === null) {
                $contacts['tier'] = $tier;
                $contacts['provider'] = $provider;
            }
        }

        if ($isCompanyLead) {
            return $this->setPhone($contacts, $clean, $lineType, $method, $sourceUrl, $confidence, $country, $tier, $provider) || $filled;
        }

        return $filled;
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    private function setEmail(array &$contacts, string $email, string $type, string $method, ?string $sourceUrl, string $confidence, string $tier, string $provider): bool
    {
        $email = $this->text->normalizeEmail($email);
        if ($email === null || $contacts['email'] !== '' || ! $this->emailAllowedForLead($email)) {
            return false;
        }

        $contacts['email'] = $email;
        $contacts['contact_sources']['email'] = $this->source($email, $type, $method, $sourceUrl, $confidence);
        $contacts['tier'] = $tier;
        $contacts['provider'] = $provider;

        return true;
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    private function setPhone(array &$contacts, string $phone, string $type, string $method, ?string $sourceUrl, string $confidence, ?string $country, string $tier, string $provider): bool
    {
        $clean = $this->text->cleanPhone($phone);
        if ($clean === null || $contacts['phone'] !== '') {
            return false;
        }

        $normalized = $this->validPhone($clean, $country);
        if ($normalized === null) {
            return false;
        }
        // A person's direct line in another country is almost always someone else's number.
        if ($type === 'direct' && $this->gatePerson !== '' && ! $this->phoneNormalizer->belongsToCountry($normalized, $this->gateCountry)) {
            return false;
        }
        $contacts['phone'] = $normalized;
        $contacts['contact_sources']['phone'] = $this->source($normalized, $type, $method, $sourceUrl, $confidence);
        if ($contacts['email'] === '' || $contacts['tier'] === null || $contacts['tier'] === 'seed') {
            $contacts['tier'] = $tier;
            $contacts['provider'] = $provider;
        }

        return true;
    }

    /**
     * @param  list<array{value: string, source_url: string, name?: ?string}>  $emails
     * @return array{value: string, source_url: string}|null
     */
    private function bestCompanyEmail(array $emails, ?string $domain, bool $allowPersonal): ?array
    {
        $best = null;
        $bestRank = PHP_INT_MAX;

        foreach ($emails as $email) {
            $value = (string) ($email['value'] ?? '');
            if ($value === '' || $this->isUnusableGeneric($value)) {
                continue;
            }

            $onDomain = $domain === null || $this->text->isOnDomain($value, $domain);
            $local = explode('@', $value)[0];
            $preferred = array_search($local, self::PREFERRED_GENERIC_LOCALS, true);

            $rank = match (true) {
                $preferred !== false => (int) $preferred,
                $this->text->isGenericEmail($value) => 20,
                $allowPersonal => 30,
                default => null,
            };
            if ($rank === null) {
                continue;
            }
            $rank += $onDomain ? 0 : 100;

            if ($rank < $bestRank) {
                $best = ['value' => $value, 'source_url' => (string) ($email['source_url'] ?? '')];
                $bestRank = $rank;
            }
        }

        return $best;
    }

    /**
     * A full, dialable number: E.164 when the country is known or the number is international;
     * a bare national number only when it is long enough to be complete.
     */
    private function validPhone(string $clean, ?string $country): ?string
    {
        $e164 = $this->phoneNormalizer->toE164($clean, $country);
        if ($e164 !== null) {
            return $e164;
        }
        $digits = preg_replace('/\D+/', '', $clean) ?? '';
        if (str_starts_with(ltrim($clean), '+') || $country !== null || strlen($digits) < 9) {
            return null;
        }

        return $clean;
    }

    /**
     * Company mailboxes must live on the company's own domain (when we know it) and never on
     * personal webmail: info@another-company.com or someone@gmail.com is not this company.
     */
    private function emailBelongsToCompany(string $email): bool
    {
        if ($this->text->isWebmail($email)) {
            return false;
        }

        return $this->gateDomain === null || $this->text->isOnDomain($email, $this->gateDomain);
    }

    /**
     * The lead's own address. Company leads: only the company's mailboxes. People: an address on
     * the company domain, or webmail / another domain only when it carries the person's name.
     */
    private function emailAllowedForLead(string $email): bool
    {
        if ($this->gatePerson === '') {
            return $this->emailBelongsToCompany($email);
        }

        if ($this->gateDomain !== null && $this->text->isOnDomain($email, $this->gateDomain)) {
            return true;
        }

        return $this->text->emailMatchesPerson($email, $this->gatePerson);
    }

    private function isUnusableGeneric(string $email): bool
    {
        $local = mb_strtolower(explode('@', $email)[0] ?? '');

        return in_array($local, self::UNUSABLE_GENERIC_LOCALS, true);
    }

    private function samePerson(string $candidate, string $personName): bool
    {
        [$firstA, $lastA] = $this->text->nameParts($candidate);
        [$firstB, $lastB] = $this->text->nameParts($personName);

        return $firstA !== '' && $lastA !== '' && $firstA === $firstB && $lastA === $lastB;
    }

    /**
     * @return ContactSource
     */
    private function source(string $value, string $type, string $method, ?string $sourceUrl, string $confidence): array
    {
        return [
            'value' => $value,
            'type' => $type,
            'method' => $method,
            'source_url' => filled($sourceUrl) ? $sourceUrl : null,
            'confidence' => $confidence,
        ];
    }

    /**
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     * @param  array<string, mixed>  $found
     */
    private function snippetSourceUrl(array $snippets, array $found): ?string
    {
        $needle = mb_strtolower((string) ($found['email'] ?? ''));
        foreach ($snippets as $snippet) {
            $blob = mb_strtolower(($snippet['title'] ?? '').' '.($snippet['snippet'] ?? ''));
            if ($needle !== '' && str_contains($blob, $needle)) {
                return $snippet['url'] ?? null;
            }
        }

        return $snippets[0]['url'] ?? null;
    }

    /**
     * @param  array<string, mixed>  $contacts
     */
    private function needsMore(array $contacts): bool
    {
        return $contacts['email'] === '' || ($contacts['phone'] === '' && $contacts['company_phone'] === '');
    }

    private function countryFromDomain(?string $domain): ?string
    {
        if ($domain === null) {
            return null;
        }

        $label = $this->geo->inferLocationFromTld($domain);

        return $label !== null ? $this->phoneNormalizer->countryFromLocation($label) : null;
    }

    /**
     * People without a direct line still get the company switchboard.
     *
     * @param  array<string, mixed>  $contacts
     * @return array<string, mixed>
     */
    private function finalize(array $contacts): array
    {
        $companyLineType = $contacts['contact_sources']['company_phone']['type'] ?? null;
        $isPerson = $this->gatePerson !== '';
        if ($contacts['phone'] === '' && $contacts['company_phone'] !== '' && ! ($isPerson && $companyLineType === 'hq_line')) {
            $contacts['phone'] = $contacts['company_phone'];
            $contacts['contact_sources']['phone'] = $contacts['contact_sources']['company_phone'];
        }

        $this->gateDomain = null;
        $this->gateCountry = null;
        $this->gatePerson = '';

        return $contacts;
    }

    /**
     * @param  array{0: Organization, 1: string, 2: ?int, 3: ?int, 4: int}  $context
     * @param  array<string, mixed>  $meta
     */
    private function log(array $context, string $tier, string $provider, bool $foundEmail, bool $foundPhone, int $credits = 0, array $meta = []): void
    {
        [$organization, $personName, $leadId, $socialSignalId, $personIndex] = $context;

        $this->usageTracker->logEnrichment(
            $organization,
            $tier,
            $provider,
            $foundEmail,
            $foundPhone,
            $credits,
            $personName !== '' ? $personName : null,
            $leadId,
            $meta,
            $socialSignalId,
            $personIndex,
        );
    }
}
