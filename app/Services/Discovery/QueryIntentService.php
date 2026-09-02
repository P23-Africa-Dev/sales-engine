<?php

namespace App\Services\Discovery;

class QueryIntentService
{
    public const TARGET_PEOPLE = 'people';

    public const TARGET_COMPANIES = 'companies';

    /**
     * @return array{target: string, limit: int}
     */
    public function analyze(string $query, string $intent = 'generate_leads'): array
    {
        $normalized = mb_strtolower(trim($query));
        $target = $this->detectTarget($normalized, $intent);
        $limit = $this->parseLimit($normalized);

        return [
            'target' => $target,
            'limit' => $limit,
        ];
    }

    private function detectTarget(string $normalized, string $intent): string
    {
        if ($intent !== 'generate_leads') {
            return self::TARGET_COMPANIES;
        }

        if (preg_match('/\b(people|person|persons|executives?|founders?|ceos?|cto|cfo|vp|directors?|contacts?|individuals?|partnership contacts?|decision makers?|professionals?|influencers?|leaders?)\b/u', $normalized)) {
            return self::TARGET_PEOPLE;
        }

        if (preg_match('/\bimportant (people|persons|names|contacts|executives)\b/u', $normalized)) {
            return self::TARGET_PEOPLE;
        }

        return self::TARGET_COMPANIES;
    }

    private function parseLimit(string $normalized): int
    {
        if (preg_match('/\b(?:give me|find|get|show|list|need|want)\s+(\d{1,2})\b/u', $normalized, $matches)) {
            return min(12, max(1, (int) $matches[1]));
        }

        if (preg_match('/\b(\d{1,2})\s+(?:people|persons|leads|prospects|contacts|names|executives|companies|accounts)\b/u', $normalized, $matches)) {
            return min(12, max(1, (int) $matches[1]));
        }

        if (preg_match('/\btop\s+(\d{1,2})\b/u', $normalized, $matches)) {
            return min(12, max(1, (int) $matches[1]));
        }

        return 8;
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
        $lower = mb_strtolower(trim($name));

        return (bool) preg_match('/\b(top|best|how to|what is|guide to|careers? in|jobs in|trends in|salary|hiring|learn|certification|degree|courses?|training|list of|ways to|\d+\s+(best|top|ways|careers|jobs|skills|companies))\b/u', $lower);
    }
}
