<?php

namespace App\Services\Enrichment;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\QueryIntentService;
use App\Services\Enrichment\DTO\EnrichedLeadProfile;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class LeadProfileEnrichmentService
{
    private const MAX_SERPER_CALLS_PER_RUN = 12;

    private const CACHE_TTL_SECONDS = 604800; // 7 days

    private int $serperCallsThisRun = 0;

    public function __construct(
        private readonly SerperPersonSearchAdapter $serper,
        private readonly GlmClient $glm,
        private readonly ContactEnrichmentOrchestrator $contactOrchestrator,
        private readonly QueryIntentService $queryIntent,
    ) {}

    public function resetBudget(): void
    {
        $this->serperCallsThisRun = 0;
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
        if (! $this->shouldEnrich($icp)) {
            return new EnrichedLeadProfile;
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

        $searchResults = $this->searchPerson($organization, $personName, $queryContext);
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

        $profile = $this->applyContactWaterfall($organization, $personName, $profile, $searchResults);

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
        \App\Services\Discovery\DTO\IcpBrief $brief,
        array $extracted,
    ): array {
        if (! $this->shouldEnrich($icp)) {
            return $extracted;
        }

        $titleHints = $brief->decisionMakers !== []
            ? array_slice($brief->decisionMakers, 0, 2)
            : ['CEO', 'founder'];
        $titleQuery = implode(' OR ', array_map(fn (string $t) => '"'.trim($t).'"', $titleHints));

        $searchResults = $this->searchDecisionMaker($organization, $companyName, $titleQuery);
        if ($searchResults === []) {
            return $extracted;
        }

        $personName = $this->guessPersonNameFromResults($searchResults, $companyName);
        if ($personName === null) {
            // Still try to pull title/linkedin from snippets without a named person.
            $profile = $this->parseWithGlm(
                $organization,
                $companyName.' contact',
                $brief->query,
                $searchResults,
                trim((string) ($titleHints[0] ?? '')),
                $companyName,
            );

            if ($profile->title !== '' || $profile->profileUrls !== []) {
                $merged = $profile->mergeIntoExtraction($extracted);
                if (trim((string) ($merged['company'] ?? '')) === '') {
                    $merged['company'] = $companyName;
                }

                return $merged;
            }

            return $extracted;
        }

        $enriched = $this->enrich($organization, $icp, $personName, $brief->query, array_merge($extracted, [
            'company' => $companyName,
            'title' => trim((string) ($extracted['title'] ?? ($titleHints[0] ?? ''))),
        ]));

        $merged = $enriched->mergeIntoExtraction($extracted);
        if (trim((string) ($merged['company'] ?? '')) === '') {
            $merged['company'] = $companyName;
        }
        // Keep Lead.name as the company; store person as contact context in title if missing.
        if (trim((string) ($merged['title'] ?? '')) === '' && $personName !== '') {
            $merged['title'] = trim((string) ($titleHints[0] ?? 'Decision maker')).' ('.$personName.')';
        } elseif (trim((string) ($merged['title'] ?? '')) !== '' && ! str_contains((string) $merged['title'], $personName)) {
            // Prefer explicit person name in meta for CRM contactability.
            $merged['contact_person'] = $personName;
        } else {
            $merged['contact_person'] = $personName;
        }

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
     * @param  list<array{title: string, snippet: ?string, url: ?string}>  $results
     */
    private function guessPersonNameFromResults(array $results, string $companyName): ?string
    {
        foreach ($results as $result) {
            $title = (string) ($result['title'] ?? '');
            $url = (string) ($result['url'] ?? '');

            if ($url !== '' && str_contains(mb_strtolower($url), 'linkedin.com/in/')) {
                $path = parse_url($url, PHP_URL_PATH) ?? '';
                if (preg_match('#/in/([^/?]+)#', $path, $matches)) {
                    $slug = str_replace(['-', '_'], ' ', $matches[1]);
                    $candidate = ucwords($slug);
                    if ($this->queryIntent->looksLikeContentOrGenericPhrase($candidate)) {
                        continue;
                    }
                    if (mb_strtolower($candidate) !== mb_strtolower($companyName)) {
                        return $candidate;
                    }
                }
            }

            // "Jane Doe - CEO at Acme | LinkedIn"
            if (preg_match('/^([A-Z][\p{L}\'-]+(?:\s+[A-Z][\p{L}\'-]+)+)\s*[-–|]/u', $title, $m)) {
                $candidate = trim($m[1]);
                if (! $this->queryIntent->looksLikeContentOrGenericPhrase($candidate)
                    && mb_strtolower($candidate) !== mb_strtolower($companyName)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    public function shouldEnrich(IcpProfile $icp): bool
    {
        $config = is_array($icp->config) ? $icp->config : [];

        return (bool) ($config['enrichContactDetails'] ?? true);
    }

    /**
     * @return list<array{title: string, snippet: ?string, url: ?string}>
     */
    private function searchPerson(Organization $organization, string $personName, string $queryContext): array
    {
        if (! $this->serper->isEnabled() || $this->serperCallsThisRun >= self::MAX_SERPER_CALLS_PER_RUN) {
            return [];
        }

        $this->serperCallsThisRun++;

        return $this->serper->searchPerson($organization, $personName, $queryContext);
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

            $profileUrls = $this->filterProfileUrls($result['profile_urls'] ?? []);
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
     * @param  mixed  $urls
     * @return list<string>
     */
    private function filterProfileUrls(mixed $urls): array
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

        return array_values(array_unique($filtered));
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

        return 'lead_enrichment:' . $organizationId . ':' . $normalized;
    }
}
