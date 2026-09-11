<?php

namespace App\Services\Discovery;

class QueryIntentService
{
    public const TARGET_PEOPLE = 'people';

    public const TARGET_COMPANIES = 'companies';

    /** First-batch size for count-free generate_leads (keeps fan-out off: FAN_OUT_THRESHOLD = 20). */
    public const DEFAULT_LEAD_LIMIT = 12;

    public const MAX_LEAD_LIMIT = 150;

    public const DEFAULT_RESEARCH_LIMIT = 10;

    /**
     * @return array{target: string, limit: int}
     */
    public function analyze(string $query, string $intent = 'generate_leads'): array
    {
        $normalized = mb_strtolower(trim($query));
        $target = $this->detectTarget($normalized, $intent);
        $limit = $this->parseLimit($normalized, $intent);

        return [
            'target' => $target,
            'limit' => $limit,
        ];
    }

    public function isListiclePeopleQuery(string $query): bool
    {
        $normalized = mb_strtolower(trim($query));

        if (preg_match('/\btop\s+\d{1,2}\b/u', $normalized)) {
            return (bool) preg_match(
                '/\b(people|person|persons|men|women|executives?|founders?|billionaires?|millionaires?|wealthiest|richest|magnates?|names|individuals?|leaders?)\b/u',
                $normalized
            );
        }

        return $this->isFactualRankingQuery($query);
    }

    public function isFactualRankingQuery(string $query): bool
    {
        $normalized = mb_strtolower(trim($query));

        if (preg_match('/\b(all of these|these)\s+(top\s+)?\d{1,2}\b/u', $normalized)) {
            return true;
        }

        if (preg_match('/\b(top|most|biggest|largest|highest)\s+\d{1,2}\b/u', $normalized)) {
            return (bool) preg_match(
                '/\b(wealthiest|richest|successful|billionaires?|millionaires?|people|men|women|companies|brands|executives?|founders?)\b/u',
                $normalized
            );
        }

        if (preg_match('/\b(wealthiest|richest|most successful|highest.?net.?worth)\b/u', $normalized)) {
            return (bool) preg_match('/\b(men|women|people|persons|billionaires?|in the world|globally|worldwide)\b/u', $normalized);
        }

        return false;
    }

    public function isAuthoritativePeopleQuery(string $query): bool
    {
        return $this->isListiclePeopleQuery($query) || $this->isFactualRankingQuery($query);
    }

    private function detectTarget(string $normalized, string $intent): string
    {
        if ($intent !== 'generate_leads') {
            return self::TARGET_COMPANIES;
        }

        if (preg_match('/\b(people|person|persons|executives?|founders?|ceos?|cto|cfo|vp|directors?|contacts?|individuals?|partnership contacts?|decision makers?|professionals?|influencers?|leaders?|men|women|billionaires?|millionaires?|wealthiest|richest|magnates?|names|prospects?|head of|managers?)\b/u', $normalized)) {
            return self::TARGET_PEOPLE;
        }

        if (preg_match('/\bimportant (people|persons|names|contacts|executives)\b/u', $normalized)) {
            return self::TARGET_PEOPLE;
        }

        return self::TARGET_COMPANIES;
    }

    private function parseLimit(string $normalized, string $intent = 'generate_leads'): int
    {
        $clamp = fn(int $value): int => min(self::MAX_LEAD_LIMIT, max(1, $value));

        if (preg_match('/\b(?:give me|find|get|show|list|need|want)\s+(\d{1,3})\b/u', $normalized, $matches)) {
            return $clamp((int) $matches[1]);
        }

        if (preg_match('/\b(\d{1,3})\s+(?:people|persons|leads|prospects|contacts|names|executives|companies|accounts|men|women)\b/u', $normalized, $matches)) {
            return $clamp((int) $matches[1]);
        }

        if (preg_match('/\btop\s+(\d{1,3})\b/u', $normalized, $matches)) {
            return $clamp((int) $matches[1]);
        }

        return $intent === 'generate_leads'
            ? self::DEFAULT_LEAD_LIMIT
            : self::DEFAULT_RESEARCH_LIMIT;
    }

    public function isListicleUrl(?string $url): bool
    {
        if (! filled($url)) {
            return false;
        }

        $path = mb_strtolower(parse_url($url, PHP_URL_PATH) ?? '');

        return (bool) preg_match('#/(blog|careers|jobs|news|articles|top-|best-|list|guide|resources|insights|trends|hiring|salary|how-to|what-is|learn|courses|training|certification|degree|university|school|education|wiki|category|tag|archive|page/\d+)#u', $path);
    }

    public function looksLikeArticleTitle(string $name): bool
    {
        return $this->looksLikeContentOrGenericPhrase($name);
    }

    /**
     * Strip the frontend's "(Find N prospects unless a different number is specified.)" wrapper.
     */
    public function stripProspectCountInstruction(string $query): string
    {
        $stripped = preg_replace(
            '/\s*\(\s*find\s+\d+\s+prospects?\s+unless\s+a\s+different\s+number\s+is\s+specified\.?\s*\)\s*/iu',
            ' ',
            $query
        );
        $stripped = preg_replace(
            '/\s*\(\s*find\s+\d+\s+(?:prospects?|leads?)\.??\s*\)\s*/iu',
            ' ',
            $stripped ?? $query
        );
        // Frontend may prefix "Find N leads." so the backend can parse the count.
        $stripped = preg_replace(
            '/^\s*find\s+\d{1,3}\s+(?:prospects?|leads?)\.?\s*/iu',
            '',
            $stripped ?? $query
        );

        return trim(preg_replace('/\s+/u', ' ', $stripped ?? $query) ?? $query);
    }

    /**
     * True when the prompt has no real targeting content (industries, places, companies, people names)
     * and is just a generic "generate leads / relevant to my ICP" instruction.
     */
    public function isGenericLeadRequest(string $query): bool
    {
        $normalized = mb_strtolower($this->stripProspectCountInstruction($query));
        if ($normalized === '') {
            return true;
        }

        $residual = preg_replace(
            '/\b(generate|create|find|get|show|give|need|want|please|me|my|the|a|an|some|any|new|more|kind|kinds|ideal|best|perfect|right|suitable|matching|relevant|to|for|based|on|using|according|active|icp|profile|build|search|anything|prospect|request|help|looking|looking for|of|with|our|your|brand|brands|business|company|companies|product|products|app|application|platform|startup|leads?|prospects?|contacts?|same|additional|extra|again|another)\b/u',
            ' ',
            $normalized
        );
        $residual = trim(preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $residual ?? '') ?? '');
        $residual = trim(preg_replace('/\s+/u', ' ', $residual) ?? '');

        return $residual === '' || mb_strlen($residual) < 3;
    }

    /**
     * Detect article/advice/listicle/generic-content phrases that should never become Lead.name.
     */
    public function looksLikeContentOrGenericPhrase(string $name): bool
    {
        $lower = mb_strtolower(trim($name));
        if ($lower === '') {
            return false;
        }

        if (preg_match('/\b(top|best|how to|how i|what is|guide to|careers? in|jobs in|trends in|salary|hiring|learn|certification|degree|courses?|training|list of|ways to|tips?|checklist|playbook|webinar|template|case study|roadmap|blueprint|strategy|framework)\b/u', $lower)) {
            return true;
        }

        if (preg_match('/\b(signs|reasons|steps|ways|tips|questions)\s+(to|you|for|about)\b/u', $lower)) {
            return true;
        }

        if (preg_match('/\b\d+\s+(best|top|ways|tips|careers|jobs|skills|companies|wealthiest|richest|people|men|women|qualified\s+leads|leads)\b/u', $lower)) {
            return true;
        }

        if (preg_match('/\b(qualified\s+leads?|matching\s+requirement|requirement|award)\b/u', $lower)) {
            return true;
        }

        // Gerund-led marketing headlines: "Scaling CEO Peer Groups with Targeted Outreach"
        if (preg_match('/^\p{L}+ing\s+.+\b(with|for|to|via|using)\b/ui', $lower)) {
            return true;
        }

        return false;
    }
}
