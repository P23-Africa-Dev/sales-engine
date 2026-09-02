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
        private readonly ApolloPersonEnricher $apollo,
        private readonly HunterEmailEnricher $hunter,
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

        $profile = $this->applyOptionalProviders($organization, $personName, $profile);

        Cache::put($cacheKey, $profile->toArray(), self::CACHE_TTL_SECONDS);

        return $profile;
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
                    'content' => 'Extract professional profile data for one person from search snippets. Return JSON: title, company_name, location, website, profile_urls (array of URLs — prefer linkedin.com/in/, wikipedia.org, official bio pages; never listicle/article URLs), summary (1-2 unique sentences about THIS person only), next_action (short sales step like "Review profile and draft outreach"), confidence (0-100). Only use facts present in snippets — never invent. No markdown.',
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

            return new EnrichedLeadProfile(
                title: trim((string) ($result['title'] ?? '')),
                companyName: trim((string) ($result['company_name'] ?? '')),
                location: trim((string) ($result['location'] ?? '')),
                website: trim((string) ($result['website'] ?? '')),
                profileUrls: $profileUrls,
                summary: $summary,
                nextAction: $nextAction,
                sourceUrls: $sourceUrls,
                confidence: min(100, max(0, (float) ($result['confidence'] ?? 50))),
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

    private function applyOptionalProviders(
        Organization $organization,
        string $personName,
        EnrichedLeadProfile $profile,
    ): EnrichedLeadProfile {
        $apollo = $this->apollo->enrich($organization, $personName, $profile->companyName !== '' ? $profile->companyName : null);

        $title = $profile->title !== '' ? $profile->title : ($apollo['title'] ?? '');
        $company = $profile->companyName !== '' ? $profile->companyName : ($apollo['company_name'] ?? '');
        $email = $profile->email !== '' ? $profile->email : ($apollo['email'] ?? '');
        $phone = $profile->phone !== '' ? $profile->phone : ($apollo['phone'] ?? '');

        $profileUrls = $profile->profileUrls;
        if (isset($apollo['linkedin_url']) && $apollo['linkedin_url'] !== '') {
            $profileUrls = $this->mergeProfileUrls($profileUrls, [$apollo['linkedin_url']]);
        }

        if ($email === '' && $company !== '') {
            $domain = $this->hunter->extractDomain($profile->website !== '' ? $profile->website : null);
            if ($domain === null) {
                $domain = $this->guessCompanyDomain($company);
            }

            if ($domain !== null) {
                $found = $this->hunter->findEmail($personName, $domain);
                if ($found !== null) {
                    $email = $found;
                }
            }
        }

        $confidence = $profile->confidence;
        if ($email !== '' || $phone !== '') {
            $confidence = min(100, $confidence + 15);
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
            ),
            default => $profile,
        };
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

    private function guessCompanyDomain(string $companyName): ?string
    {
        $slug = mb_strtolower(preg_replace('/[^a-z0-9]+/u', '', $companyName) ?? '');

        if ($slug === '') {
            return null;
        }

        return $slug . '.com';
    }

    private function cacheKey(int $organizationId, string $personName): string
    {
        $normalized = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $personName) ?? $personName));

        return 'lead_enrichment:' . $organizationId . ':' . $normalized;
    }
}
