<?php

namespace App\Services\Enrichment;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\QueryIntentService;
use App\Services\Enrichment\DTO\EnrichedLeadProfile;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class LeadProfileEnrichmentService
{
    private const MAX_SERPER_CALLS_PER_RUN = 24;

    private const CACHE_TTL_SECONDS = 604800; // 7 days

    private int $serperCallsThisRun = 0;

    private bool $deferContactWaterfall = false;

    public function __construct(
        private readonly SerperPersonSearchAdapter $serper,
        private readonly GlmClient $glm,
        private readonly ContactEnrichmentOrchestrator $contactOrchestrator,
        private readonly QueryIntentService $queryIntent,
        private readonly ProfileUrlValidator $profileUrlValidator,
    ) {}

    public function resetBudget(): void
    {
        $this->serperCallsThisRun = 0;
    }

    public function setDeferContactWaterfall(bool $defer): void
    {
        $this->deferContactWaterfall = $defer;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    public function enrich(
        Organization $organization,
        IcpProfile $icp,
        string $personName,
        string $queryContext = '',
        array $extracted = [],
    ): EnrichedLeadProfile {
        if (! $this->shouldEnrich($icp) || $this->deferContactWaterfall) {
            // First-batch path: keep title/company/linkedin from extraction; enrich contacts later.
            return new EnrichedLeadProfile(
                title: trim((string) ($extracted['title'] ?? '')),
                companyName: trim((string) ($extracted['company'] ?? '')),
                email: trim((string) ($extracted['email'] ?? '')),
                phone: trim((string) ($extracted['phone'] ?? '')),
                website: trim((string) ($extracted['website'] ?? '')),
                profileUrls: array_values(array_filter([
                    trim((string) ($extracted['linkedin_url'] ?? '')),
                ])),
                nextAction: 'Review profile and draft outreach',
                confidence: 40.0,
            );
        }

        $cacheKey = $this->cacheKey($organization->id, $personName);
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return EnrichedLeadProfile::fromArray($cached);
        }

        $seedTitle = trim((string) ($extracted['title'] ?? ''));
        $seedCompany = trim((string) ($extracted['company'] ?? ''));
        $seedUrl = trim((string) ($extracted['linkedin_url'] ?? ''));
        $seedEmail = trim((string) ($extracted['email'] ?? ''));
        $seedPhone = trim((string) ($extracted['phone'] ?? ''));

        $searchResults = $this->searchPerson($organization, $personName, $queryContext, $seedTitle);
        $profile = $this->parseWithGlm($organization, $personName, $queryContext, $searchResults, $seedTitle, $seedCompany);

        if ($seedTitle !== '' && $profile->title === '') {
            $profile = $this->withField($profile, 'title', $seedTitle);
        }

        if ($seedCompany !== '' && $profile->companyName === '') {
            $profile = $this->withField($profile, 'companyName', $seedCompany);
        }

        if ($seedUrl !== '' && ! $this->queryIntent->isListicleUrl($seedUrl) && $profile->profileUrls === []) {
            $profile = $this->withProfileUrl($profile, $seedUrl);
        }

        if ($seedEmail !== '' && $profile->email === '') {
            $profile = $this->withContact($profile, email: $seedEmail);
        }

        if ($seedPhone !== '' && $profile->phone === '') {
            $profile = $this->withContact($profile, phone: $seedPhone);
        }

        if (! $this->deferContactWaterfall) {
            $profile = $this->applyContactWaterfall($organization, $personName, $profile, $searchResults);
        }

        $profile = $profile->withEnrichmentAttempted(true);

        Cache::put($cacheKey, $profile->toArray(), self::CACHE_TTL_SECONDS);

        return $profile;
    }

    /**
     * Best-effort decision-maker lookup for company-target leads.
     *
     * @param  array<string, mixed>  $extracted
     * @return array<string, mixed>
     */
    public function enrichCompanyDecisionMaker(
        Organization $organization,
        IcpProfile $icp,
        string $companyName,
        IcpBrief $brief,
        array $extracted,
    ): array {
        if (! $this->shouldEnrich($icp)) {
            $extracted['enrichment_attempted'] = false;

            return $extracted;
        }

        $titleHints = $brief->decisionMakers !== []
            ? array_slice($brief->decisionMakers, 0, 2)
            : ['CEO', 'founder'];
        $titleQuery = implode(' OR ', array_map(fn (string $t) => '"'.trim($t).'"', $titleHints));

        $searchResults = $this->searchDecisionMaker($organization, $companyName, $titleQuery);
        if ($searchResults === []) {
            // A real lookup ran and found nothing usable — this is a genuine
            // attempt, not "never tried."
            $extracted['enrichment_attempted'] = true;

            return $extracted;
        }

        $person = $this->guessPersonFromResults($searchResults, $companyName);
        $personName = $person['name'] ?? null;
        if ($personName === null) {
            // Still try to pull title/linkedin from snippets without a named person.
            $profile = $this->parseWithGlm(
                $organization,
                $companyName.' contact',
                $brief->query,
                $searchResults,
                trim((string) ($titleHints[0] ?? '')),
                $companyName,
            )->withEnrichmentAttempted(true);

            if ($profile->title !== '' || $profile->profileUrls !== []) {
                $merged = $profile->mergeIntoExtraction($extracted);
                if (trim((string) ($merged['company'] ?? '')) === '') {
                    $merged['company'] = $companyName;
                }

                return $merged;
            }

            $extracted['enrichment_attempted'] = true;

            return $extracted;
        }

        // The role comes only from the search result itself, never from the roles the ICP
        // asked for: a guessed title presented as fact is worse than no title.
        $evidencedTitle = (string) ($person['title'] ?? '');
        $enriched = $this->enrich($organization, $icp, $personName, $brief->query, array_merge($extracted, [
            'company' => $companyName,
            'title' => $evidencedTitle,
        ]));

        $merged = $enriched->mergeIntoExtraction($extracted);
        if (trim((string) ($merged['company'] ?? '')) === '') {
            $merged['company'] = $companyName;
        }
        if ($evidencedTitle !== '') {
            $merged['title'] = $evidencedTitle;
        }
        if (($person['url'] ?? '') !== '' && trim((string) ($merged['linkedin_url'] ?? '')) === '') {
            $merged['linkedin_url'] = $person['url'];
        }
        $merged['contact_person'] = $personName;

        return $merged;
    }

    /**
     * @return list<array{title: string, snippet: ?string, url: ?string}>
     */
    private function searchDecisionMaker(Organization $organization, string $companyName, string $titleQuery): array
    {
        if (! $this->serper->isEnabled() || $this->serperCallsThisRun >= self::MAX_SERPER_CALLS_PER_RUN) {
            return [];
        }

        $this->serperCallsThisRun++;

        return $this->serper->searchPerson(
            $organization,
            $companyName,
            trim($titleQuery.' site:linkedin.com/in'),
        );
    }

    /**
     * A named person who the result shows actually works at the company, with the role the
     * result states. Results that don't mention the company are skipped: a search for
     * "Managing Director Cargill" also returns people from other firms.
     *
     * @param  list<array{title: string, snippet: ?string, url: ?string}>  $results
     * @return array{name: string, title: string, url: string}|null
     */
    private function guessPersonFromResults(array $results, string $companyName): ?array
    {
        foreach ($results as $result) {
            $title = trim((string) ($result['title'] ?? ''));
            $url = (string) ($result['url'] ?? '');
            $isProfile = $url !== '' && str_contains(mb_strtolower($url), 'linkedin.com/in/');

            if (! $this->mentionsCompany($title.' '.($result['snippet'] ?? ''), $companyName)) {
                continue;
            }

            // "Jane Doe - CEO - Acme | LinkedIn" / "Jane Doe – Head of Sales at Acme"
            $segments = array_values(array_filter(array_map('trim', preg_split('/\s+[-–|·]\s+/u', $title) ?: [])));
            $name = $segments[0] ?? '';
            if (! $this->looksLikePersonName($name, $companyName)) {
                $name = $isProfile ? $this->nameFromProfileSlug($url) : '';
            }
            if ($name === '' || ! $this->looksLikePersonName($name, $companyName)) {
                continue;
            }

            $role = '';
            foreach (array_slice($segments, 1) as $segment) {
                $segment = trim((string) preg_replace('/\s+(?:at|@)\s+.+$/iu', '', $segment));
                if ($segment !== '' && ! preg_match('/linkedin/i', $segment) && ! $this->mentionsCompany($segment, $companyName)
                    && preg_match('/\b(?:ceo|cto|cfo|coo|chief|founder|co-founder|director|head|manager|partner|principal|president|vice|vp|officer|lead|owner|chairman|associate|analyst)\b/i', $segment)) {
                    $role = mb_substr($segment, 0, 90);
                    break;
                }
            }

            return ['name' => $name, 'title' => $role, 'url' => $isProfile ? $url : ''];
        }

        return null;
    }

    private function mentionsCompany(string $text, string $companyName): bool
    {
        $core = mb_strtolower(trim((string) preg_replace(
            '/\b(?:limited|ltd|plc|inc|llc|company|co|group|holdings|cooperative|international|corporation|corp)\b\.?/iu',
            ' ',
            $companyName,
        )));
        $core = trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', $core));
        if ($core === '') {
            return false;
        }

        $haystack = ' '.trim((string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower($text))).' ';

        return str_contains($haystack, ' '.$core.' ');
    }

    private function looksLikePersonName(string $candidate, string $companyName): bool
    {
        $candidate = trim($candidate);
        if (! preg_match('/^\p{Lu}[\p{L}\'’.-]+(?:\s+\p{Lu}[\p{L}\'’.-]*){1,3}$/u', $candidate)) {
            return false;
        }

        return mb_strtolower($candidate) !== mb_strtolower($companyName)
            && ! $this->mentionsCompany($candidate, $companyName)
            && ! $this->queryIntent->looksLikeContentOrGenericPhrase($candidate);
    }

    /**
     * "jane-doe-4a5b6c" → "Jane Doe". Concatenated slugs ("janedoe") can't be split
     * reliably and are rejected.
     */
    private function nameFromProfileSlug(string $url): string
    {
        $path = (string) (parse_url($url, PHP_URL_PATH) ?? '');
        if (! preg_match('#/in/([^/?]+)#', $path, $matches)) {
            return '';
        }

        $words = array_filter(
            explode(' ', str_replace(['-', '_'], ' ', rawurldecode($matches[1]))),
            fn (string $word): bool => $word !== '' && preg_match('/^\p{L}+$/u', $word) === 1,
        );
        if (count($words) < 2 || count($words) > 4) {
            return '';
        }

        return implode(' ', array_map(fn (string $w): string => mb_convert_case($w, MB_CASE_TITLE), $words));
    }

    public function shouldEnrich(IcpProfile $icp): bool
    {
        $config = is_array($icp->config) ? $icp->config : [];

        return (bool) ($config['enrichContactDetails'] ?? true);
    }

    /**
     * @return list<array{title: string, snippet: ?string, url: ?string}>
     */
    private function searchPerson(Organization $organization, string $personName, string $queryContext, string $title = ''): array
    {
        if (! $this->serper->isEnabled() || $this->serperCallsThisRun >= self::MAX_SERPER_CALLS_PER_RUN) {
            return [];
        }

        $this->serperCallsThisRun++;

        return $this->serper->searchPerson($organization, $personName, $queryContext, $title);
    }

    /**
     * @param  list<array{title: string, snippet: ?string, url: ?string}>  $searchResults
     */
    private function parseWithGlm(
        Organization $organization,
        string $personName,
        string $queryContext,
        array $searchResults,
        string $seedTitle,
        string $seedCompany,
    ): EnrichedLeadProfile {
        if (! $this->glm->isConfigured() || $searchResults === []) {
            return new EnrichedLeadProfile(
                title: $seedTitle,
                companyName: $seedCompany,
                nextAction: 'Review profile and draft outreach',
                confidence: $seedTitle !== '' || $seedCompany !== '' ? 35.0 : 0.0,
            );
        }

        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract professional profile data for one person from search snippets. Return JSON: title, company_name, location, website, email (only if explicitly present; never invent; reject generic info@/contact@), phone (only if explicitly present; never invent), profile_urls (array of URLs — prefer linkedin.com/in/, wikipedia.org, official bio pages; never listicle/article URLs), summary (1-2 unique sentences about THIS person only), next_action (short sales step like "Review profile and draft outreach"), confidence (0-100). Only use facts present in snippets — never invent. No markdown.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'person_name' => $personName,
                        'user_query' => $queryContext,
                        'seed_title' => $seedTitle,
                        'seed_company' => $seedCompany,
                        'search_results' => array_slice($searchResults, 0, 5),
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            $trustedFromSearch = [];
            foreach ($searchResults as $sr) {
                $u = trim((string) ($sr['url'] ?? ''));
                if ($u !== '') {
                    $trustedFromSearch[] = $u;
                }
            }
            $profileUrls = $this->filterProfileUrls($result['profile_urls'] ?? [], $trustedFromSearch);
            $sourceUrls = $this->collectSourceUrls($searchResults, $profileUrls);

            $summary = trim((string) ($result['summary'] ?? ''));
            if ($this->looksLikeListicleText($summary)) {
                $summary = '';
            }

            $nextAction = trim((string) ($result['next_action'] ?? ''));
            if ($nextAction === '' || $this->looksLikeListicleText($nextAction)) {
                $nextAction = 'Review profile and draft outreach';
            }

            $email = trim((string) ($result['email'] ?? ''));
            $phone = trim((string) ($result['phone'] ?? ''));
            if ($email !== '' && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $email = '';
            }
            if ($phone !== '') {
                $digits = preg_replace('/\D+/', '', $phone) ?? '';
                if (strlen($digits) < 7 || strlen($digits) > 15) {
                    $phone = '';
                }
            }

            return new EnrichedLeadProfile(
                title: trim((string) ($result['title'] ?? '')),
                companyName: trim((string) ($result['company_name'] ?? '')),
                location: trim((string) ($result['location'] ?? '')),
                website: trim((string) ($result['website'] ?? '')),
                email: $email,
                phone: $phone,
                profileUrls: $profileUrls,
                summary: $summary,
                nextAction: $nextAction,
                sourceUrls: $sourceUrls,
                confidence: min(100, max(0, (float) ($result['confidence'] ?? 50))),
                contactEnrichmentTier: ($email !== '' || $phone !== '') ? 'tier1' : '',
                contactEnrichmentProvider: ($email !== '' || $phone !== '') ? 'glm_profile' : '',
            );
        } catch (\Throwable $e) {
            Log::warning('GLM person enrichment failed', ['person' => $personName, 'error' => $e->getMessage()]);

            return new EnrichedLeadProfile(
                title: $seedTitle,
                companyName: $seedCompany,
                nextAction: 'Review profile and draft outreach',
                confidence: 25.0,
            );
        }
    }

    /**
     * @param  list<array{title: string, snippet: ?string, url: ?string}>  $searchResults
     */
    private function applyContactWaterfall(
        Organization $organization,
        string $personName,
        EnrichedLeadProfile $profile,
        array $searchResults,
    ): EnrichedLeadProfile {
        $contacts = $this->contactOrchestrator->enrichContacts(
            $organization,
            $personName,
            [
                'email' => $profile->email,
                'phone' => $profile->phone,
                'company' => $profile->companyName,
                'website' => $profile->website,
                'linkedin_url' => $profile->profileUrls[0] ?? '',
                'profile_urls' => $profile->profileUrls,
            ],
            $searchResults,
        );

        $email = $profile->email !== '' ? $profile->email : ($contacts['email'] ?? '');
        $phone = $profile->phone !== '' ? $profile->phone : ($contacts['phone'] ?? '');
        $title = $profile->title !== '' ? $profile->title : ($contacts['title'] ?? '');
        $company = $profile->companyName !== '' ? $profile->companyName : ($contacts['company_name'] ?? '');

        $profileUrls = $profile->profileUrls;
        if (($contacts['linkedin_url'] ?? '') !== '') {
            $profileUrls = $this->mergeProfileUrls($profileUrls, [(string) $contacts['linkedin_url']]);
        }

        $confidence = $profile->confidence;
        if ($email !== '' || $phone !== '') {
            $confidence = min(100, $confidence + 15);
        }

        $tier = $profile->contactEnrichmentTier;
        $provider = $profile->contactEnrichmentProvider;
        if (($contacts['tier'] ?? null) !== null && ($contacts['tier'] ?? '') !== 'seed') {
            $tier = (string) $contacts['tier'];
            $provider = (string) ($contacts['provider'] ?? $provider);
        } elseif ($tier === '' && ($email !== '' || $phone !== '')) {
            $tier = (string) ($contacts['tier'] ?? 'tier1');
            $provider = (string) ($contacts['provider'] ?? 'snippet_extractor');
        }

        return new EnrichedLeadProfile(
            title: $title,
            companyName: $company,
            location: $profile->location,
            website: $profile->website,
            email: $email,
            phone: $phone,
            profileUrls: $profileUrls,
            summary: $profile->summary,
            nextAction: $profile->nextAction,
            sourceUrls: $profile->sourceUrls,
            confidence: $confidence,
            contactEnrichmentTier: $tier,
            contactEnrichmentProvider: $provider,
        );
    }

    /**
     * @param  list<string>  $trustedUrls
     * @return list<string>
     */
    private function filterProfileUrls(mixed $urls, array $trustedUrls = []): array
    {
        if (! is_array($urls)) {
            return [];
        }

        $filtered = [];
        foreach ($urls as $url) {
            if (! is_string($url) || trim($url) === '') {
                continue;
            }

            $normalized = trim($url);
            if ($this->queryIntent->isListicleUrl($normalized)) {
                continue;
            }

            if ($this->isPreferredProfileUrl($normalized)) {
                $filtered[] = $normalized;
            }
        }

        $unique = array_values(array_unique($filtered));

        return $this->profileUrlValidator->filterValid($unique, $trustedUrls);
    }

    private function isPreferredProfileUrl(string $url): bool
    {
        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = mb_strtolower((string) parse_url($url, PHP_URL_PATH));

        if (str_contains($host, 'linkedin.com') && str_contains($path, '/in/')) {
            return true;
        }

        if (str_contains($host, 'wikipedia.org') && str_contains($path, '/wiki/')) {
            return true;
        }

        if (str_contains($path, '/about') || str_contains($path, '/bio') || str_contains($path, '/team/')) {
            return true;
        }

        return ! $this->queryIntent->isListicleUrl($url);
    }

    /**
     * @param  list<array{title: string, snippet: ?string, url: ?string}>  $searchResults
     * @param  list<string>  $profileUrls
     * @return list<string>
     */
    private function collectSourceUrls(array $searchResults, array $profileUrls): array
    {
        $urls = $profileUrls;

        foreach ($searchResults as $result) {
            $url = trim((string) ($result['url'] ?? ''));
            if ($url !== '' && ! $this->queryIntent->isListicleUrl($url)) {
                $urls[] = $url;
            }
        }

        return array_values(array_unique($urls));
    }

    /**
     * @param  list<string>  $existing
     * @param  list<string>  $incoming
     * @return list<string>
     */
    private function mergeProfileUrls(array $existing, array $incoming): array
    {
        return $this->filterProfileUrls(array_merge($existing, $incoming));
    }

    private function withField(EnrichedLeadProfile $profile, string $field, string $value): EnrichedLeadProfile
    {
        return match ($field) {
            'title' => new EnrichedLeadProfile(
                title: $value,
                companyName: $profile->companyName,
                location: $profile->location,
                website: $profile->website,
                email: $profile->email,
                phone: $profile->phone,
                profileUrls: $profile->profileUrls,
                summary: $profile->summary,
                nextAction: $profile->nextAction,
                sourceUrls: $profile->sourceUrls,
                confidence: max($profile->confidence, 40.0),
                contactEnrichmentTier: $profile->contactEnrichmentTier,
                contactEnrichmentProvider: $profile->contactEnrichmentProvider,
            ),
            'companyName' => new EnrichedLeadProfile(
                title: $profile->title,
                companyName: $value,
                location: $profile->location,
                website: $profile->website,
                email: $profile->email,
                phone: $profile->phone,
                profileUrls: $profile->profileUrls,
                summary: $profile->summary,
                nextAction: $profile->nextAction,
                sourceUrls: $profile->sourceUrls,
                confidence: max($profile->confidence, 40.0),
                contactEnrichmentTier: $profile->contactEnrichmentTier,
                contactEnrichmentProvider: $profile->contactEnrichmentProvider,
            ),
            default => $profile,
        };
    }

    private function withContact(
        EnrichedLeadProfile $profile,
        string $email = '',
        string $phone = '',
    ): EnrichedLeadProfile {
        return new EnrichedLeadProfile(
            title: $profile->title,
            companyName: $profile->companyName,
            location: $profile->location,
            website: $profile->website,
            email: $email !== '' ? $email : $profile->email,
            phone: $phone !== '' ? $phone : $profile->phone,
            profileUrls: $profile->profileUrls,
            summary: $profile->summary,
            nextAction: $profile->nextAction,
            sourceUrls: $profile->sourceUrls,
            confidence: $profile->confidence,
            contactEnrichmentTier: $profile->contactEnrichmentTier,
            contactEnrichmentProvider: $profile->contactEnrichmentProvider,
        );
    }

    private function withProfileUrl(EnrichedLeadProfile $profile, string $url): EnrichedLeadProfile
    {
        $urls = $this->mergeProfileUrls($profile->profileUrls, [$url]);

        return new EnrichedLeadProfile(
            title: $profile->title,
            companyName: $profile->companyName,
            location: $profile->location,
            website: $profile->website,
            email: $profile->email,
            phone: $profile->phone,
            profileUrls: $urls,
            summary: $profile->summary,
            nextAction: $profile->nextAction,
            sourceUrls: $profile->sourceUrls,
            confidence: $profile->confidence,
            contactEnrichmentTier: $profile->contactEnrichmentTier,
            contactEnrichmentProvider: $profile->contactEnrichmentProvider,
        );
    }

    private function looksLikeListicleText(string $text): bool
    {
        if ($text === '') {
            return false;
        }

        return (bool) preg_match('/\d+[\.\)]\s+[A-Z][a-z]+/u', $text)
            || str_contains(mb_strtolower($text), ' · ')
            || $this->queryIntent->looksLikeArticleTitle($text);
    }

    private function cacheKey(int $organizationId, string $personName): string
    {
        $normalized = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $personName) ?? $personName));

        return 'lead_enrichment:'.$organizationId.':'.$normalized;
    }
}
