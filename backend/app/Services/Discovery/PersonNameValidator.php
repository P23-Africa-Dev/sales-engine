<?php

namespace App\Services\Discovery;

class PersonNameValidator
{
    /** Content / listicle words — reject if present as a name token. */
    /** @var list<string> */
    private const STOPWORDS = [
        'for',
        'info',
        'the',
        'world',
        'interviewing',
        'billionaires',
        'billionaire',
        'richest',
        'wealthiest',
        'people',
        'men',
        'women',
        'top',
        'best',
        'list',
        'names',
        'name',
        'more',
        'about',
        'here',
        'read',
        'watch',
        'video',
        'channel',
        'podcast',
        'episode',
        'news',
        'article',
        'blog',
        'guide',
        'learn',
        'how',
        'peer',
        'peers',
        'group',
        'groups',
        'outreach',
        'requirement',
        'requirements',
        'award',
        'awards',
        'leads',
        'scaling',
        'matching',
        'strategy',
        'strategies',
        'framework',
        'frameworks',
        'engine',
        'engines',
        'signal',
        'signals',
        'targeted',
        'qualified',
        'tips',
        'tip',
        'checklist',
        'playbook',
        'webinar',
        'template',
        'roadmap',
        'blueprint',
        'case',
        'study',
        'roles',
        'role',
        'merger',
        'mergers',
        // Market / industry report nouns — never person-name tokens.
        'market',
        'markets',
        'research',
        'equipment',
        'machinery',
        'industry',
        'industries',
        'report',
        'reports',
        'forecast',
        'forecasts',
        'outlook',
        'analysis',
        'insights',
        'overview',
        'sector',
        'sectors',
        'statistics',
        'stats',
        'whitepaper',
        'loader',
        'excavator',
        'bulldozer',
        'construction',
        'global',
        'worldwide',
    ];

    /**
     * Job-title tokens often glued into LinkedIn slugs ("jane-doe-ceo-paystack").
     * Strip these — do not reject the whole name.
     *
     * @var list<string>
     */
    private const TITLE_TOKENS = [
        'ceo',
        'cto',
        'cfo',
        'coo',
        'cmo',
        'cio',
        'cpo',
        'founder',
        'cofounder',
        'co-founder',
        'president',
        'director',
        'managing',
        'manager',
        'vp',
        'head',
        'lead',
        'sales',
        'marketing',
        'product',
        'engineering',
        'partner',
        'partners',
        'partnerships',
        'owner',
        'executive',
        'officer',
        'chief',
        'md',
        'gm',
    ];

    public function __construct(private readonly QueryIntentService $queryIntent) {}

    /**
     * Strip title noise from LinkedIn-style slug names before validation / display.
     */
    public function normalizePersonName(string $name): string
    {
        $trimmed = trim($name);
        if ($trimmed === '') {
            return '';
        }

        $tokens = preg_split('/\s+/u', $trimmed) ?: [];
        $kept = [];
        foreach ($tokens as $token) {
            $lower = mb_strtolower(trim($token, " \t.,;:|-_"));
            if ($lower === '' || in_array($lower, self::TITLE_TOKENS, true)) {
                continue;
            }
            $kept[] = $token;
        }

        // Prefer 2–3 leftover tokens (typical given + family name).
        if (count($kept) >= 2) {
            return trim(implode(' ', array_slice($kept, 0, 3)));
        }

        if (count($kept) === 1) {
            return trim($kept[0]);
        }

        return $trimmed;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    public function isValidPersonName(string $name, array $extracted = []): bool
    {
        // Reject content headlines before title-stripping can create false positives
        // like "11 Tips..." → "11 to Generate".
        if ($this->queryIntent->looksLikeContentOrGenericPhrase(trim($name))) {
            return false;
        }

        $normalized = $this->normalizePersonName($name);
        $trimmed = $normalized !== '' ? $normalized : trim($name);

        if ($trimmed === '' || mb_strlen($trimmed) < 3) {
            return false;
        }

        if ($this->queryIntent->looksLikeContentOrGenericPhrase($trimmed)) {
            return false;
        }

        // Digits / punctuation-heavy strings are never person names.
        if (preg_match('/\d/u', $trimmed)) {
            return false;
        }

        $lower = mb_strtolower($trimmed);
        if (in_array($lower, self::STOPWORDS, true) || in_array($lower, self::TITLE_TOKENS, true)) {
            return false;
        }

        $tokens = preg_split('/\s+/u', $trimmed) ?: [];
        $tokens = array_values(array_filter($tokens, fn(string $t) => $t !== ''));

        if (count($tokens) === 0) {
            return false;
        }

        // Reject leftover content stopwords (not title tokens — those were stripped).
        foreach ($tokens as $token) {
            $tokenLower = mb_strtolower($token);
            if (in_array($tokenLower, self::STOPWORDS, true) || in_array($tokenLower, self::TITLE_TOKENS, true)) {
                return false;
            }
        }

        // Real person names are typically 2–4 tokens after title stripping.
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
            && ! in_array(mb_strtolower($token), self::STOPWORDS, true)
            && ! in_array(mb_strtolower($token), self::TITLE_TOKENS, true);
    }
}
