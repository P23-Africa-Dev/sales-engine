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

    public function normalize(string $query, IcpProfile $icp): string
    {
        $cleaned = $this->queryIntent->stripProspectCountInstruction($query);
        $trimmed = trim($cleaned);

        if ($trimmed === '') {
            return $this->icpSeededQuery($icp);
        }

        if ($this->isMetaPromptRequest($trimmed) || $this->queryIntent->isGenericLeadRequest($trimmed)) {
            $theme = $this->extractTheme($trimmed);

            return $this->composeActionableQuery($icp, $theme);
        }

        // Soften "give me leads of people that can scale my X" into role+industry search.
        if ($this->isGoalFramedLeadRequest($trimmed)) {
            $theme = $this->extractTheme($trimmed);

            return $this->composeActionableQuery($icp, $theme !== '' ? $theme : $trimmed);
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
            return trim($m[0] . ($residual !== '' && ! str_contains($residual, $m[1]) ? ' ' . $residual : ''));
        }

        return $residual;
    }

    private function composeActionableQuery(IcpProfile $icp, string $theme): string
    {
        $theme = trim(preg_replace('/\s+/u', ' ', $theme) ?? $theme);
        if ($theme !== '') {
            return $theme.' companies';
        }

        return $this->icpSeededQuery($icp);
    }

    private function icpSeededQuery(IcpProfile $icp): string
    {
        return IcpBrief::fromIcpProfile($icp)->interestSearchSeed();
    }

    /**
     * Short LinkedIn-friendly queries for high-yield first batches.
     * Uses interest language only — never ICP industry / territory / role fields.
     *
     * @return list<string>
     */
    public function firstBatchPeopleQueries(IcpProfile $icp): array
    {
        $seed = IcpBrief::fromIcpProfile($icp)->interestSearchSeed();

        return array_values(array_unique(array_filter([
            trim($seed.' site:linkedin.com/in'),
            trim($seed.' executives founders'),
        ])));
    }
}
