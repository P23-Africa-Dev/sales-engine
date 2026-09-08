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
        'peer', 'peers', 'group', 'groups', 'outreach', 'requirement', 'requirements',
        'award', 'awards', 'lead', 'leads', 'scaling', 'matching', 'strategy',
        'strategies', 'framework', 'frameworks', 'engine', 'engines', 'signal',
        'signals', 'targeted', 'qualified', 'tips', 'tip', 'checklist', 'playbook',
        'webinar', 'template', 'roadmap', 'blueprint', 'case', 'study', 'ceo',
        'cto', 'cfo', 'roles', 'role', 'pm', 'merger', 'mergers', 'sales',
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

        if ($this->queryIntent->looksLikeContentOrGenericPhrase($trimmed)) {
            return false;
        }

        $lower = mb_strtolower($trimmed);
        if (in_array($lower, self::STOPWORDS, true)) {
            return false;
        }

        $tokens = preg_split('/\s+/u', $trimmed) ?: [];
        $tokens = array_values(array_filter($tokens, fn (string $t) => $t !== ''));

        if (count($tokens) === 0) {
            return false;
        }

        // Reject if any token is a content/role noun blocklist word.
        foreach ($tokens as $token) {
            if (in_array(mb_strtolower($token), self::STOPWORDS, true)) {
                return false;
            }
        }

        // Real person names are typically 2–4 tokens.
        if (count($tokens) > 4) {
            return false;
        }

        if (count($tokens) === 1) {
            return $this->hasCorroboration($extracted) && ! (bool) ($extracted['low_confidence'] ?? true);
        }

        $plausible = 0;
        foreach ($tokens as $token) {
            if ($this->isPlausibleNameToken($token)) {
                $plausible++;
            }
        }

        // Strong shape: at least 2 plausible name tokens.
        if ($plausible >= 2 && count($tokens) <= 3) {
            return true;
        }

        // Borderline: require title+company, LinkedIn profile, or listicle origin.
        return $this->hasCorroboration($extracted);
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function hasCorroboration(array $extracted): bool
    {
        if ($this->hasTitleAndCompany($extracted)) {
            return true;
        }

        if ((bool) ($extracted['from_listicle'] ?? false)) {
            return true;
        }

        $linkedin = trim((string) ($extracted['linkedin_url'] ?? ''));
        if ($linkedin !== '' && str_contains(mb_strtolower($linkedin), 'linkedin.com/in/')) {
            return true;
        }

        $profileUrls = $extracted['profile_urls'] ?? [];
        if (is_array($profileUrls)) {
            foreach ($profileUrls as $url) {
                if (is_string($url) && str_contains(mb_strtolower($url), 'linkedin.com/in/')) {
                    return true;
                }
            }
        }

        return false;
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

    private function isPlausibleNameToken(string $token): bool
    {
        // Allow letters, apostrophes, hyphens (e.g. O'Brien, Jean-Luc).
        return (bool) preg_match("/^[\p{L}][\p{L}'\-]*$/u", $token)
            && mb_strlen($token) >= 2
            && ! in_array(mb_strtolower($token), self::STOPWORDS, true);
    }
}
