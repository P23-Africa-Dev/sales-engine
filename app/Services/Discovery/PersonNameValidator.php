<?php

namespace App\Services\Discovery;

class PersonNameValidator
{
    /** @var list<string> */
    private const STOPWORDS = [
        'for', 'info', 'the', 'world', 'interviewing', 'billionaires', 'billionaire',
        'richest', 'wealthiest', 'people', 'men', 'women', 'top', 'best', 'list',
        'names', 'name', 'more', 'about', 'here', 'read', 'watch', 'video', 'channel',
        'podcast', 'episode', 'news', 'article', 'blog', 'guide', 'learn', 'how',
    ];

    public function __construct(private readonly QueryIntentService $queryIntent) {}

    /**
     * @param  array<string, mixed>  $extracted
     */
    public function isValidPersonName(string $name, array $extracted = []): bool
    {
        $trimmed = trim($name);
        if ($trimmed === '' || mb_strlen($trimmed) < 3) {
            return false;
        }

        if ($this->queryIntent->looksLikeArticleTitle($trimmed)) {
            return false;
        }

        $lower = mb_strtolower($trimmed);
        if (in_array($lower, self::STOPWORDS, true)) {
            return false;
        }

        foreach (self::STOPWORDS as $stopword) {
            if ($lower === $stopword || str_starts_with($lower, $stopword.' ') || str_ends_with($lower, ' '.$stopword)) {
                if (! $this->hasTitleAndCompany($extracted)) {
                    return false;
                }
            }
        }

        $tokens = preg_split('/\s+/u', $trimmed) ?: [];
        $tokens = array_values(array_filter($tokens, fn (string $t) => $t !== ''));

        if (count($tokens) === 1) {
            return $this->hasTitleAndCompany($extracted) && ! (bool) ($extracted['low_confidence'] ?? true);
        }

        if (count($tokens) < 2) {
            return false;
        }

        $capitalized = 0;
        foreach ($tokens as $token) {
            if (preg_match('/^[A-Z][\p{L}\']+$/u', $token)) {
                $capitalized++;
            }
        }

        if ($capitalized < 2) {
            return $this->hasTitleAndCompany($extracted);
        }

        foreach ($tokens as $token) {
            if (in_array(mb_strtolower($token), self::STOPWORDS, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function hasTitleAndCompany(array $extracted): bool
    {
        return trim((string) ($extracted['title'] ?? '')) !== ''
            && trim((string) ($extracted['company'] ?? '')) !== ''
            && ! (bool) ($extracted['low_confidence'] ?? true);
    }
}
