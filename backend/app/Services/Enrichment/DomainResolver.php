<?php

namespace App\Services\Enrichment;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Finds a company's official domain from evidence only: the known website,
 * LinkedIn/search snippets, then a Serper "official website" search.
 * Never blind-guesses "<slug>.com".
 */
class DomainResolver
{
    private const CACHE_DAYS = 14;

    /**
     * Hosts that are never a company's own website.
     */
    private const NON_COMPANY_HOSTS = [
        'linkedin.com', 'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com',
        'tiktok.com', 'pinterest.com', 'threads.net', 'wikipedia.org', 'wikidata.org', 'crunchbase.com',
        'bloomberg.com', 'zoominfo.com', 'glassdoor.com', 'indeed.com', 'yelp.com', 'yellowpages.com',
        'google.com', 'goo.gl', 'g.page', 'maps.app.goo.gl', 'dnb.com', 'opencorporates.com', 'pitchbook.com',
        'rocketreach.co', 'apollo.io', 'hunter.io', 'signalhire.com', 'contactout.com', 'lusha.com',
        'owler.com', 'craft.co', 'medium.com', 'github.com', 'reddit.com', 'quora.com', 'tracxn.com',
        'cbinsights.com', 'manta.com', 'bbb.org', 'trustpilot.com', 'clutch.co', 'g2.com', 'capterra.com',
        'angel.co', 'wellfound.com', 'producthunt.com', 'businesslist.com.ng', 'vconnect.com',
        'finelib.com', 'nairaland.com', 'yellowpages.com.ng', 'companieshouse.gov.uk', 'find-and-update.company-information.service.gov.uk',
        'whatsapp.com', 'wa.me', 'telegram.me', 't.me', 'linktr.ee', 'bit.ly', 'forbes.com', 'reuters.com',
        'techcrunch.com', 'businessday.ng', 'guardian.ng', 'punchng.com', 'zaubacorp.com', 'kompass.com',
        'europages.com', 'alibaba.com', 'amazon.com', 'ebay.com', 'jumia.com.ng', 'apple.com',
        'play.google.com', 'apps.apple.com', 'blogspot.com', 'wordpress.com', 'wix.com', 'squarespace.com',
    ];

    private const COMPANY_SUFFIXES = [
        'inc', 'incorporated', 'ltd', 'limited', 'llc', 'llp', 'lp', 'plc', 'corp', 'corporation', 'company',
        'co', 'group', 'holdings', 'holding', 'gmbh', 'ag', 'sa', 'sas', 'srl', 'bv', 'nv', 'pty', 'pvt',
        'the', 'and', 'of', 'international', 'intl', 'global', 'nigeria', 'ng', 'uk', 'usa', 'africa',
    ];

    /**
     * Industry/common words that never identify one company on their own.
     */
    private const GENERIC_TOKENS = [
        'cocoa', 'coffee', 'tea', 'cashew', 'shea', 'agro', 'agri', 'agric', 'farm', 'farms', 'food', 'foods',
        'trade', 'trading', 'export', 'exports', 'import', 'commodities', 'processing', 'capital', 'ventures',
        'venture', 'partners', 'investment', 'investments', 'fund', 'funds', 'finance', 'financial', 'bank',
        'pay', 'payments', 'tech', 'technology', 'technologies', 'digital', 'solutions', 'services', 'systems',
        'logistics', 'energy', 'health', 'media', 'consulting', 'industries', 'enterprise', 'enterprises',
        'business', 'development', 'foundation', 'initiative', 'federation', 'association', 'council', 'premium',
    ];

    public function __construct(
        private readonly SerperClient $serper,
    ) {}

    /**
     * @param  list<array{title?: ?string, snippet?: ?string, url?: ?string}>  $snippets
     */
    public function resolve(?string $website, ?string $company, array $snippets = [], ?string $location = null): ?string
    {
        $company = trim((string) $company);
        $fromWebsite = $this->hostFrom($website);
        if ($fromWebsite !== null && ! $this->isNonCompanyHost($fromWebsite)
            && (! $this->isGovernmentHost($fromWebsite) || $this->hostMatchesCompany($fromWebsite, $company))) {
            return $fromWebsite;
        }

        if ($company === '' || $this->companyTokens($company) === []) {
            return null;
        }

        $fromSnippets = $this->fromSnippets($company, $snippets);
        if ($fromSnippets !== null) {
            return $fromSnippets;
        }

        if (! $this->serper->isConfigured()) {
            return null;
        }

        $cacheKey = 'enrichment:domain:v1:'.md5(mb_strtolower($company.'|'.trim((string) $location)));
        $cached = Cache::get($cacheKey);
        if (is_string($cached)) {
            return $cached !== '' ? $cached : null;
        }

        $query = '"'.$company.'" official website';
        if (filled($location)) {
            $query .= ' '.trim((string) $location);
        }

        $rows = $this->serper->organicRows($this->serper->search(['q' => $query, 'num' => 10]));
        $domain = $this->fromSnippets($company, $rows);

        Cache::put($cacheKey, $domain ?? '', now()->addDays(self::CACHE_DAYS));

        return $domain;
    }

    public function hostFrom(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '' || str_contains($url, '@') && ! str_contains($url, '://')) {
            return null;
        }

        $host = parse_url(preg_match('#^[a-z][a-z0-9+.\-]*://#i', $url) ? $url : 'https://'.ltrim($url, '/'), PHP_URL_HOST);
        if (! is_string($host) || $host === '' || ! str_contains($host, '.')) {
            return null;
        }

        $host = mb_strtolower(rtrim($host, '.'));

        return str_starts_with($host, 'www.') ? mb_substr($host, 4) : $host;
    }

    public function isNonCompanyHost(string $host): bool
    {
        $host = mb_strtolower($host);
        foreach (self::NON_COMPANY_HOSTS as $blocked) {
            if ($host === $blocked || str_ends_with($host, '.'.$blocked)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Regulator/government sites often list licensed companies; a company "website" found
     * there (e.g. a PSP on cbn.gov.ng) is the regulator's, not the company's.
     */
    public function isGovernmentHost(string $host): bool
    {
        return (bool) preg_match('/(?:^|\.)(?:gov|go|gouv|gob|govt|mil)(?:\.[a-z]{2})?$/i', $host);
    }

    /**
     * True when the name is a single industry word ("Cocoa", "Payments Ltd"), which can't be
     * tied to one business's website, listing or phone line.
     */
    public function isGenericCompanyName(string $company): bool
    {
        $tokens = $this->companyTokens($company);

        return count($tokens) === 1 && in_array($tokens[0], self::GENERIC_TOKENS, true);
    }

    /**
     * Significant lower-case tokens of a company name ("Acme Corp Ltd" → ["acme"]).
     *
     * @return list<string>
     */
    public function companyTokens(string $company): array
    {
        $normalized = mb_strtolower(Str::ascii($company));
        $normalized = str_replace('&', ' ', $normalized);
        $tokens = preg_split('/[^a-z0-9]+/', $normalized) ?: [];

        return array_values(array_filter(
            $tokens,
            fn (string $token): bool => $token !== '' && mb_strlen($token) >= 2 && ! in_array($token, self::COMPANY_SUFFIXES, true),
        ));
    }

    public function hostMatchesCompany(string $host, string $company): bool
    {
        $tokens = $this->companyTokens($company);
        if ($tokens === []) {
            return false;
        }

        $labels = explode('.', mb_strtolower($host));
        $core = str_replace('-', '', implode('', array_slice($labels, 0, max(1, count($labels) - 1))));

        $joined = implode('', $tokens);
        if (count($tokens) === 1 && in_array($joined, self::GENERIC_TOKENS, true)) {
            // A one-word industry name ("Cocoa") only matches its exact domain (cocoa.com).
            return $core === $joined;
        }

        if (str_contains($core, $joined)) {
            return true;
        }

        $initials = implode('', array_map(fn (string $token): string => $token[0], $tokens));
        if (count($tokens) >= 2 && $core === $initials) {
            return true;
        }

        // "Cargill Ghana" → cargill.com is fine, but "Cocoa Processing Company" must not
        // land on cocoafederation.com: an industry word alone identifies nobody.
        return mb_strlen($tokens[0]) >= 3
            && ! in_array($tokens[0], self::GENERIC_TOKENS, true)
            && str_contains($core, $tokens[0]);
    }

    /**
     * @param  list<array{title?: ?string, snippet?: ?string, url?: ?string}>  $snippets
     */
    private function fromSnippets(string $company, array $snippets): ?string
    {
        foreach ($snippets as $snippet) {
            $candidates = [(string) ($snippet['url'] ?? '')];
            $text = ($snippet['title'] ?? '').' '.($snippet['snippet'] ?? '');
            if (preg_match_all('#(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)*\.[a-z]{2,24})(?=[/\s,;)"\']|$)#i', $text, $matches)) {
                foreach ($matches[1] as $found) {
                    $candidates[] = $found;
                }
            }

            foreach ($candidates as $candidate) {
                if (str_contains($candidate, '@')) {
                    continue;
                }
                $host = $this->hostFrom($candidate);
                if ($host !== null && ! $this->isNonCompanyHost($host) && $this->hostMatchesCompany($host, $company)) {
                    return $host;
                }
            }
        }

        return null;
    }
}
