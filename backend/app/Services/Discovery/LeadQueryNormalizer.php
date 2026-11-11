<?php

namespace App\Services\Discovery;

use App\Models\IcpProfile;
use App\Services\Discovery\DTO\IcpBrief;

/**
 * Turns meta / vague generate-leads prompts into actionable Serper search queries.
 * Users often ask "give me a prompt to find leads for X" while Generate Prospects is selected —
 * that must become a real discovery query, not a search for the word "prompt".
 */
class LeadQueryNormalizer
{
    public function __construct(private readonly QueryIntentService $queryIntent) {}

    /**
     * @param  string|null  $entityMode  Explicit UI choice (both|companies|people); only "companies" may add a company noun.
     */
    public function normalize(string $query, IcpProfile $icp, ?string $entityMode = null): string
    {
        $cleaned = $this->queryIntent->stripEntityModeCue($this->queryIntent->stripProspectCountInstruction($query));
        $target = QueryIntentService::targetFromEntityMode($entityMode);
        $trimmed = trim($cleaned);

        if ($trimmed === '') {
            return $this->icpSeededQuery($icp);
        }

        if ($this->isMetaPromptRequest($trimmed) || $this->queryIntent->isGenericLeadRequest($trimmed)) {
            $theme = $this->extractTheme($trimmed);

            return $this->composeActionableQuery($icp, $theme, $target);
        }

        // Soften "give me leads of people that can scale my X" into role+industry search.
        if ($this->isGoalFramedLeadRequest($trimmed)) {
            $theme = $this->extractTheme($trimmed);

            return $this->composeActionableQuery($icp, $theme !== '' ? $theme : $trimmed, $target);
        }

        return $trimmed;
    }

    public function isMetaPromptRequest(string $query): bool
    {
        $normalized = mb_strtolower(trim($query));

        return (bool) preg_match(
            '/\b(give me|suggest|write|craft|create|share|what)\b.{0,40}\bprompts?\b/u',
            $normalized
        ) || (bool) preg_match(
            '/\bprompts?\s+(i\s+can|to|for|that)\b.{0,40}\b(generate|find|get)\b.{0,20}\bleads?\b/u',
            $normalized
        );
    }

    public function isGoalFramedLeadRequest(string $query): bool
    {
        $normalized = mb_strtolower(trim($query));

        if ((bool) preg_match(
            '/\b(scale|grow|expand|promote|partner|distribution)\b.{0,60}\b(app|application|product|platform|startup|business)\b/u',
            $normalized
        ) && (bool) preg_match('/\b(leads?|prospects?|people|industries|partners?)\b/u', $normalized)) {
            return true;
        }

        // "ideal / perfect prospects for my brand|business|company"
        return (bool) preg_match(
            '/\b(ideal|perfect|best|right|suitable|matching)\b.{0,40}\b(leads?|prospects?|customers?|clients?)\b.{0,40}\b(for|to)\b.{0,20}\b(my|our|the)\b.{0,20}\b(brand|business|company|product|app|application|platform)\b/u',
            $normalized
        ) || (bool) preg_match(
            '/\b(leads?|prospects?)\b.{0,40}\b(for|to)\b.{0,20}\b(my|our|the)\b.{0,20}\b(brand|business|company|product)\b/u',
            $normalized
        );
    }

    private function extractTheme(string $query): string
    {
        $normalized = mb_strtolower($query);

        // Drop meta wrapper language; keep product / industry / geography nouns.
        $residual = preg_replace(
            '/\b(okay|ok|please|give me|suggest|write|craft|create|share|what|a|an|the|prompt|prompts|i can use|to|for|that|can|will|generate|find|get|show|list|kind|kinds|ideal|perfect|best|suitable|matching|leads?|prospects?|contacts?|potential|people|or|industries|of|my|our|using|based on|active|icp|profile|request|help|looking|brand|brands|business|company|companies)\b/u',
            ' ',
            $normalized
        ) ?? $normalized;

        $residual = trim(preg_replace('/[^\p{L}\p{N}\s\-&]+/u', ' ', $residual) ?? '');
        $residual = trim(preg_replace('/\s+/u', ' ', $residual) ?? '');

        // Prefer recognizable product/brand tokens (e.g. "ajo fintech application").
        if (preg_match('/\b([a-z0-9][a-z0-9\-]{1,30})\s+(fintech|payments?|saas|app|application|platform)\b/u', $normalized, $m)) {
            return trim($m[0].($residual !== '' && ! str_contains($residual, $m[1]) ? ' '.$residual : ''));
        }

        return $residual;
    }

    private function composeActionableQuery(IcpProfile $icp, string $theme, ?string $target = null): string
    {
        $theme = trim(preg_replace('/\s+/u', ' ', $theme) ?? $theme);
        if ($theme !== '') {
            // Appending "companies" used to flip people / both asks into company-only searches.
            return $target === QueryIntentService::TARGET_COMPANIES ? $theme.' companies' : $theme;
        }

        return $this->icpSeededQuery($icp);
    }

    private function icpSeededQuery(IcpProfile $icp): string
    {
        return IcpBrief::fromIcpProfile($icp)->interestSearchSeed();
    }

    /**
     * First batch for company searches: LinkedIn company pages list real companies with
     * their industry and HQ, where a plain web search returns listicles and agencies.
     * The page query wants a short "sector place" phrase ("B2B SaaS London").
     *
     * @return list<string>
     */
    public function firstBatchCompanyQueries(IcpBrief $brief): array
    {
        $theme = $brief->cleanedUserQuery();
        if ($theme === '') {
            $theme = $brief->interestSearchSeed();
        }

        $short = preg_replace('/\b(companies|company|firms?|businesses|business|organi[sz]ations?|startups?|providers?|in|the|of|based|top|best|leading|list)\b/iu', ' ', $theme) ?? $theme;
        $short = trim(preg_replace('/\s+/u', ' ', $short) ?? $short);
        $words = preg_split('/\s+/u', $short) ?: [];
        $short = implode(' ', array_slice($words, 0, 5));

        return array_values(array_unique(array_filter([
            $short !== '' ? $short.' site:linkedin.com/company' : null,
            trim($brief->searchQuery()),
        ])));
    }

    /**
     * Short LinkedIn-friendly queries for high-yield first batches of people.
     * Theme = the user's own ask (or the ICP interest seed for generic asks); roles = the ICP's
     * decision makers, because those are the people the user sells to. Territory stays out of the
     * text — Serper gl/location and the country gate handle geography.
     *
     * @return list<string>
     */
    public function firstBatchPeopleQueries(IcpBrief $brief): array
    {
        $theme = $brief->cleanedUserQuery();
        if ($theme === '') {
            $theme = $brief->interestSearchSeed();
        }
        $theme = trim($theme);

        if (preg_match('/\b(ceos?|ctos?|cfos?|coos?|cmos?|founders?|directors?|managers?|head of|vps?|vice president|president|owners?|partners?)\b/iu', $theme)) {
            return array_values(array_unique(array_filter([
                trim($theme.' site:linkedin.com/in'),
                $theme,
            ])));
        }

        $queries = [];
        foreach ($brief->peopleRoleTerms() as $role) {
            $queries[] = trim('"'.$role.'" '.$theme.' site:linkedin.com/in');
        }
        if ($queries === []) {
            $queries[] = trim($theme.' site:linkedin.com/in');
        }
        $queries[] = trim($theme.' executives founders');

        return array_values(array_unique(array_filter($queries)));
    }
}
