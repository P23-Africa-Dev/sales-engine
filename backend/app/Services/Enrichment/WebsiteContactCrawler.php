<?php

namespace App\Services\Enrichment;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Polite, bounded crawl of a company website (homepage + up to 6 contact/
 * about/team pages) that extracts on-page contact details.
 *
 * @phpstan-type CrawlEmail array{value: string, source_url: string, name: ?string}
 * @phpstan-type CrawlPhone array{value: string, source_url: string, kind: string}
 * @phpstan-type CrawlPerson array{name: string, title: string, email: ?string, phone: ?string, source_url: string}
 * @phpstan-type CrawlProfile array{url: ?string, title: string, description: string, excerpt: string}
 */
class WebsiteContactCrawler
{
    public const USER_AGENT = 'Mozilla/5.0 (compatible; ContactFinderBot/1.0)';

    private const CACHE_DAYS = 14;

    private const TIMEOUT_SECONDS = 5;

    private const MAX_BYTES = 1_572_864;

    private const MAX_EXTRA_PAGES = 6;

    private const EXCERPT_CHARS = 2000;

    /**
     * Ordered by usefulness — earlier keywords win the limited page budget.
     */
    private const PAGE_KEYWORDS = [
        'contact', 'kontakt', 'contacto', 'impressum', 'team', 'leadership', 'management', 'people',
        'about', 'about-us', 'who-we-are', 'support', 'careers',
    ];

    private const TEAM_PAGE_KEYWORDS = ['team', 'leadership', 'management', 'people', 'about', 'who-we-are', 'board', 'staff'];

    private const TITLE_KEYWORDS = [
        'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'founder', 'co-founder', 'cofounder', 'director', 'manager',
        'head', 'officer', 'president', 'partner', 'chief', 'vp', 'vice', 'lead', 'chairman', 'chairperson',
        'chair', 'secretary', 'owner', 'principal', 'executive', 'md', 'gm', 'treasurer', 'engineer',
        'consultant', 'associate', 'analyst', 'coordinator', 'supervisor', 'administrator', 'specialist',
        'controller', 'advisor', 'adviser', 'counsel', 'architect', 'proprietor', 'trustee',
    ];

    public function __construct(
        private readonly ContactTextExtractor $text,
    ) {}

    /**
     * @return array{
     *     domain: string,
     *     emails: list<CrawlEmail>,
     *     phones: list<CrawlPhone>,
     *     whatsapp: list<array{value: string, source_url: string}>,
     *     addresses: list<string>,
     *     people: list<CrawlPerson>,
     *     social_links: list<string>,
     *     profile: CrawlProfile,
     *     pages_fetched: int
     * }
     */
    public function crawl(string $domain): array
    {
        $domain = $this->normalizeDomain($domain);

        return Cache::remember($this->crawlCacheKey($domain), now()->addDays(self::CACHE_DAYS), fn (): array => $this->crawlUncached($domain));
    }

    /**
     * Homepage title/meta description/visible-text excerpt for ICP evidence.
     * Reuses a full crawl when one is cached; otherwise fetches the homepage only.
     *
     * @return CrawlProfile
     */
    public function fetchProfile(string $domain): array
    {
        $domain = $this->normalizeDomain($domain);
        $crawled = Cache::get($this->crawlCacheKey($domain));
        if (is_array($crawled) && is_array($crawled['profile'] ?? null)) {
            return $crawled['profile'];
        }

        return Cache::remember($this->profileCacheKey($domain), now()->addDays(self::CACHE_DAYS), function () use ($domain): array {
            if ($domain === '') {
                return $this->emptyProfile();
            }

            $rules = $this->robotsRules($domain);
            $homepage = $this->fetchHomepage($domain, $rules);
            if ($homepage === null) {
                return $this->emptyProfile();
            }

            return $this->profileFrom($homepage['url'], $this->loadDom($homepage['body']));
        });
    }

    /**
     * fetchProfile() for many domains at once: robots.txt and homepages are fetched in
     * parallel pools, so checking 16 candidate websites costs one timeout, not sixteen.
     *
     * @param  list<string>  $domains
     * @return array<string, CrawlProfile> keyed by normalized domain
     */
    public function fetchProfiles(array $domains): array
    {
        $profiles = [];
        $pending = [];
        foreach ($domains as $domain) {
            $domain = $this->normalizeDomain((string) $domain);
            if ($domain === '' || isset($profiles[$domain]) || isset($pending[$domain])) {
                continue;
            }
            $crawled = Cache::get($this->crawlCacheKey($domain));
            $cached = is_array($crawled) && is_array($crawled['profile'] ?? null)
                ? $crawled['profile']
                : Cache::get($this->profileCacheKey($domain));
            if (is_array($cached)) {
                $profiles[$domain] = $cached;
            } else {
                $pending[$domain] = true;
            }
        }

        if ($pending === []) {
            return $profiles;
        }

        $robotsUrls = [];
        foreach (array_keys($pending) as $domain) {
            $robotsUrls[$domain] = 'https://'.$domain.'/robots.txt';
        }
        $robotsBodies = $this->fetchManyRaw(array_values($robotsUrls));

        $homepages = [];
        foreach (array_keys($pending) as $domain) {
            $rules = isset($robotsBodies[$robotsUrls[$domain]])
                ? $this->parseRobots(substr($robotsBodies[$robotsUrls[$domain]], 0, 512_000))
                : ['allow' => [], 'disallow' => []];
            if ($this->isAllowed('/', $rules)) {
                $homepages[$domain] = 'https://'.$domain.'/';
            } else {
                $profiles[$domain] = $this->emptyProfile();
            }
        }

        $bodies = $this->fetchMany(array_values($homepages));
        foreach ($homepages as $domain => $url) {
            $profile = isset($bodies[$url])
                ? $this->profileFrom($url, $this->loadDom($bodies[$url]))
                : $this->emptyProfile();
            $profiles[$domain] = $profile;
            Cache::put($this->profileCacheKey($domain), $profile, now()->addDays(self::CACHE_DAYS));
        }

        return $profiles;
    }

    /**
     * Parallel GETs for non-HTML bodies (robots.txt).
     *
     * @param  list<string>  $urls
     * @return array<string, string>
     */
    private function fetchManyRaw(array $urls): array
    {
        if ($urls === []) {
            return [];
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($urls): array {
                $requests = [];
                foreach ($urls as $url) {
                    $requests[] = $pool->as($url)
                        ->timeout(self::TIMEOUT_SECONDS)
                        ->connectTimeout(self::TIMEOUT_SECONDS)
                        ->withUserAgent(self::USER_AGENT)
                        ->get($url);
                }

                return $requests;
            });
        } catch (\Throwable) {
            return [];
        }

        $bodies = [];
        foreach ($urls as $url) {
            $response = $responses[$url] ?? null;
            if ($response instanceof Response && $response->successful()) {
                $bodies[$url] = $response->body();
            }
        }

        return $bodies;
    }

    private function profileCacheKey(string $domain): string
    {
        return 'enrichment:site-profile:v1:'.$domain;
    }

    /**
     * @return array<string, mixed>
     */
    private function crawlUncached(string $domain): array
    {
        $result = [
            'domain' => $domain,
            'emails' => [],
            'phones' => [],
            'whatsapp' => [],
            'addresses' => [],
            'people' => [],
            'social_links' => [],
            'profile' => $this->emptyProfile(),
            'pages_fetched' => 0,
        ];

        if ($domain === '') {
            return $result;
        }

        $rules = $this->robotsRules($domain);
        $homepage = $this->fetchHomepage($domain, $rules);
        if ($homepage === null) {
            return $result;
        }

        $homeDom = $this->loadDom($homepage['body']);
        $result['profile'] = $this->profileFrom($homepage['url'], $homeDom);

        $pages = [$homepage['url'] => $homeDom];
        $links = $this->candidateLinks($homeDom, $homepage['url'], $domain, $rules);
        foreach ($this->fetchMany($links) as $url => $body) {
            $pages[$url] = $this->loadDom($body);
        }

        $result['pages_fetched'] = count($pages);

        $emails = [];
        $phones = [];
        $whatsapp = [];
        $addresses = [];
        $people = [];
        $social = [];

        foreach ($pages as $url => $dom) {
            $extracted = $this->extractFromPage($url, $dom);
            foreach ($extracted['emails'] as $email) {
                $emails[$email['value']] ??= $email;
                if ($email['name'] !== null && $emails[$email['value']]['name'] === null) {
                    $emails[$email['value']]['name'] = $email['name'];
                }
            }
            foreach ($extracted['phones'] as $phone) {
                $key = preg_replace('/\D+/', '', $phone['value']) ?? $phone['value'];
                if (! isset($phones[$key]) || $this->phoneRank($phone['kind']) < $this->phoneRank($phones[$key]['kind'])) {
                    $phones[$key] = $phone;
                }
            }
            foreach ($extracted['whatsapp'] as $number) {
                $whatsapp[$number['value']] ??= $number;
            }
            foreach ($extracted['addresses'] as $address) {
                $addresses[$address] = $address;
            }
            foreach ($extracted['people'] as $person) {
                $key = mb_strtolower($person['name']);
                $people[$key] = isset($people[$key]) ? $this->mergePerson($people[$key], $person) : $person;
            }
            foreach ($extracted['social_links'] as $link) {
                $social[$link] = $link;
            }
        }

        foreach ($people as $person) {
            if ($person['email'] !== null && isset($emails[$person['email']]) && $emails[$person['email']]['name'] === null) {
                $emails[$person['email']]['name'] = $person['name'];
            }
        }

        $phoneList = array_values($phones);
        usort($phoneList, fn (array $a, array $b): int => $this->phoneRank($a['kind']) <=> $this->phoneRank($b['kind']));

        $result['emails'] = array_values($emails);
        $result['phones'] = $phoneList;
        $result['whatsapp'] = array_values($whatsapp);
        $result['addresses'] = array_values($addresses);
        $result['people'] = array_values($people);
        $result['social_links'] = array_values($social);

        return $result;
    }

    /**
     * @param  array{allow: list<string>, disallow: list<string>}  $rules
     * @return array{url: string, body: string}|null
     */
    private function fetchHomepage(string $domain, array $rules): ?array
    {
        if (! $this->isAllowed('/', $rules)) {
            return null;
        }

        foreach (['https://'.$domain.'/', 'https://www.'.$domain.'/', 'http://'.$domain.'/'] as $url) {
            $body = $this->fetch($url);
            if ($body !== null) {
                return ['url' => $url, 'body' => $body];
            }
        }

        return null;
    }

    private function fetch(string $url): ?string
    {
        try {
            $response = $this->request()->get($url);
        } catch (\Throwable $e) {
            Log::debug('Website crawl fetch failed', ['url' => $url, 'error' => $e->getMessage()]);

            return null;
        }

        return $this->usableBody($response);
    }

    /**
     * @param  list<string>  $urls
     * @return array<string, string>
     */
    private function fetchMany(array $urls): array
    {
        if ($urls === []) {
            return [];
        }

        try {
            $responses = Http::pool(function (Pool $pool) use ($urls): array {
                $requests = [];
                foreach ($urls as $url) {
                    $requests[] = $pool->as($url)
                        ->timeout(self::TIMEOUT_SECONDS)
                        ->connectTimeout(self::TIMEOUT_SECONDS)
                        ->withUserAgent(self::USER_AGENT)
                        ->withOptions($this->sizeGuardOptions())
                        ->accept('text/html,application/xhtml+xml')
                        ->get($url);
                }

                return $requests;
            });
        } catch (\Throwable $e) {
            Log::debug('Website crawl pool failed', ['error' => $e->getMessage()]);

            return [];
        }

        $bodies = [];
        foreach ($urls as $url) {
            $response = $responses[$url] ?? null;
            $body = $response instanceof Response ? $this->usableBody($response) : null;
            if ($body !== null) {
                $bodies[$url] = $body;
            }
        }

        return $bodies;
    }

    private function usableBody(Response $response): ?string
    {
        if (! $response->successful()) {
            return null;
        }

        $type = mb_strtolower((string) $response->header('Content-Type'));
        if ($type !== '' && ! str_contains($type, 'html') && ! str_contains($type, 'text/plain')) {
            return null;
        }

        $body = $response->body();

        return $body !== '' ? substr($body, 0, self::MAX_BYTES) : null;
    }

    private function request(): PendingRequest
    {
        return Http::timeout(self::TIMEOUT_SECONDS)
            ->connectTimeout(self::TIMEOUT_SECONDS)
            ->withUserAgent(self::USER_AGENT)
            ->withOptions($this->sizeGuardOptions())
            ->accept('text/html,application/xhtml+xml');
    }

    /**
     * Abort downloads whose declared size exceeds the cap.
     *
     * @return array<string, mixed>
     */
    private function sizeGuardOptions(): array
    {
        return [
            'on_headers' => function ($response): void {
                $length = (int) ($response->getHeaderLine('Content-Length') ?: 0);
                if ($length > self::MAX_BYTES) {
                    throw new \RuntimeException('Page exceeds crawl size cap');
                }
            },
        ];
    }

    /**
     * @return array{allow: list<string>, disallow: list<string>}
     */
    private function robotsRules(string $domain): array
    {
        $rules = ['allow' => [], 'disallow' => []];

        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->withUserAgent(self::USER_AGENT)
                ->get('https://'.$domain.'/robots.txt');
        } catch (\Throwable) {
            return $rules;
        }

        if (! $response->successful()) {
            return $rules;
        }

        return $this->parseRobots(substr($response->body(), 0, 512_000));
    }

    /**
     * Rules for "User-agent: *" (or our bot token when present).
     *
     * @return array{allow: list<string>, disallow: list<string>}
     */
    public function parseRobots(string $robots): array
    {
        $groups = [];
        $currentAgents = [];
        $lastWasAgent = false;

        foreach (preg_split('/\r\n|\r|\n/', $robots) ?: [] as $line) {
            $line = trim((string) preg_replace('/#.*$/', '', $line));
            if ($line === '' || ! str_contains($line, ':')) {
                continue;
            }

            [$field, $value] = array_map('trim', explode(':', $line, 2));
            $field = mb_strtolower($field);

            if ($field === 'user-agent') {
                if (! $lastWasAgent) {
                    $currentAgents = [];
                }
                $currentAgents[] = mb_strtolower($value);
                $groups[mb_strtolower($value)] ??= ['allow' => [], 'disallow' => []];
                $lastWasAgent = true;

                continue;
            }

            $lastWasAgent = false;
            if (! in_array($field, ['allow', 'disallow'], true)) {
                continue;
            }

            foreach ($currentAgents as $agent) {
                if ($value !== '') {
                    $groups[$agent][$field][] = $value;
                }
            }
        }

        return $groups['contactfinderbot'] ?? $groups['*'] ?? ['allow' => [], 'disallow' => []];
    }

    /**
     * Longest matching rule wins; Allow wins ties.
     *
     * @param  array{allow: list<string>, disallow: list<string>}  $rules
     */
    public function isAllowed(string $path, array $rules): bool
    {
        $path = $path === '' ? '/' : $path;
        $bestDisallow = -1;
        $bestAllow = -1;

        foreach ($rules['disallow'] as $rule) {
            if ($this->robotsRuleMatches($rule, $path)) {
                $bestDisallow = max($bestDisallow, strlen($rule));
            }
        }
        foreach ($rules['allow'] as $rule) {
            if ($this->robotsRuleMatches($rule, $path)) {
                $bestAllow = max($bestAllow, strlen($rule));
            }
        }

        return $bestDisallow < 0 || $bestAllow >= $bestDisallow;
    }

    private function robotsRuleMatches(string $rule, string $path): bool
    {
        $anchored = str_ends_with($rule, '$');
        $pattern = preg_quote(rtrim($rule, '$'), '#');
        $pattern = str_replace('\*', '.*', $pattern);

        return (bool) preg_match('#^'.$pattern.($anchored ? '$' : '').'#', $path);
    }

    /**
     * @param  array{allow: list<string>, disallow: list<string>}  $rules
     * @return list<string>
     */
    private function candidateLinks(?DOMDocument $dom, string $baseUrl, string $domain, array $rules): array
    {
        if ($dom === null) {
            return [];
        }

        $scored = [];
        foreach ($dom->getElementsByTagName('a') as $anchor) {
            $href = trim($anchor->getAttribute('href'));
            if ($href === '' || preg_match('/^(mailto:|tel:|javascript:|#)/i', $href)) {
                continue;
            }

            $absolute = $this->absoluteUrl($href, $baseUrl);
            if ($absolute === null) {
                continue;
            }

            $host = mb_strtolower((string) parse_url($absolute, PHP_URL_HOST));
            $host = str_starts_with($host, 'www.') ? mb_substr($host, 4) : $host;
            if ($host !== $domain) {
                continue;
            }

            $path = (string) (parse_url($absolute, PHP_URL_PATH) ?: '/');
            if (preg_match('/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)$/i', $path) || $path === '/') {
                continue;
            }

            $haystack = mb_strtolower($path.' '.trim($anchor->textContent));
            $rank = null;
            foreach (self::PAGE_KEYWORDS as $index => $keyword) {
                if (str_contains($haystack, $keyword)) {
                    $rank = $index;
                    break;
                }
            }
            if ($rank === null || ! $this->isAllowed($path, $rules)) {
                continue;
            }

            $absolute = strtok($absolute, '#') ?: $absolute;
            if (! isset($scored[$absolute]) || $scored[$absolute] > $rank) {
                $scored[$absolute] = $rank;
            }
        }

        asort($scored);

        return array_slice(array_keys($scored), 0, self::MAX_EXTRA_PAGES);
    }

    private function absoluteUrl(string $href, string $baseUrl): ?string
    {
        if (preg_match('#^https?://#i', $href)) {
            return $href;
        }

        $scheme = (string) parse_url($baseUrl, PHP_URL_SCHEME);
        $host = (string) parse_url($baseUrl, PHP_URL_HOST);
        if ($scheme === '' || $host === '') {
            return null;
        }

        if (str_starts_with($href, '//')) {
            return $scheme.':'.$href;
        }

        if (str_starts_with($href, '/')) {
            return $scheme.'://'.$host.$href;
        }

        if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $href)) {
            return null;
        }

        $basePath = (string) (parse_url($baseUrl, PHP_URL_PATH) ?: '/');
        $dir = str_ends_with($basePath, '/') ? $basePath : (dirname($basePath).'/');

        return $scheme.'://'.$host.str_replace('//', '/', $dir.$href);
    }

    /**
     * @return array{
     *     emails: list<CrawlEmail>,
     *     phones: list<CrawlPhone>,
     *     whatsapp: list<array{value: string, source_url: string}>,
     *     addresses: list<string>,
     *     people: list<CrawlPerson>,
     *     social_links: list<string>
     * }
     */
    public function extractFromPage(string $url, ?DOMDocument $dom): array
    {
        $out = ['emails' => [], 'phones' => [], 'whatsapp' => [], 'addresses' => [], 'people' => [], 'social_links' => []];
        if ($dom === null) {
            return $out;
        }

        $addEmail = function (?string $raw, ?string $name = null) use (&$out, $url): void {
            $email = $this->text->normalizeEmail($raw !== null ? rawurldecode($raw) : null);
            if ($email !== null) {
                $out['emails'][] = ['value' => $email, 'source_url' => $url, 'name' => $name];
            }
        };
        $addPhone = function (?string $raw, string $kind) use (&$out, $url): void {
            $phone = $this->text->cleanPhone($raw !== null ? rawurldecode($raw) : null);
            if ($phone !== null) {
                $out['phones'][] = ['value' => $phone, 'source_url' => $url, 'kind' => $kind];
            }
        };

        foreach ($dom->getElementsByTagName('a') as $anchor) {
            $href = trim($anchor->getAttribute('href'));
            if (preg_match('/^mailto:(.+)$/i', $href, $match)) {
                foreach (explode(',', explode('?', $match[1])[0]) as $address) {
                    $addEmail($address);
                }
            } elseif (preg_match('/^tel:(.+)$/i', $href, $match)) {
                $addPhone($match[1], 'tel_link');
            } elseif (preg_match('#(?:wa\.me/|whatsapp\.com/send/?\?phone=)\+?(\d{7,15})#i', $href, $match)) {
                $out['whatsapp'][] = ['value' => '+'.$match[1], 'source_url' => $url];
                $addPhone('+'.$match[1], 'whatsapp');
            } elseif (preg_match('#^https?://(?:[a-z]{2,3}\.)?(?:www\.)?(linkedin\.com/company|facebook\.com|instagram\.com|x\.com|twitter\.com)/[^\s"\']+#i', $href)) {
                $out['social_links'][] = $href;
            }

            if ($anchor->hasAttribute('data-cfemail')) {
                $addEmail($this->decodeCloudflareEmail($anchor->getAttribute('data-cfemail')));
            }
        }

        $xpath = new DOMXPath($dom);
        foreach ($xpath->query('//*[@data-cfemail]') ?: [] as $node) {
            if ($node instanceof DOMElement) {
                $addEmail($this->decodeCloudflareEmail($node->getAttribute('data-cfemail')));
            }
        }

        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $decoded = json_decode(trim($script->textContent), true);
            if (is_array($decoded)) {
                $this->walkJsonLd($decoded, $url, $out, $addEmail, $addPhone);
            }
        }

        $visibleText = $this->visibleText($dom);
        foreach ($this->text->extractEmails($visibleText) as $email) {
            $addEmail($email);
        }
        foreach ($this->text->extractLabelledPhones($visibleText) as $phone) {
            $addPhone($phone, 'labelled_text');
        }

        $path = mb_strtolower((string) parse_url($url, PHP_URL_PATH));
        $isTeamPage = false;
        foreach (self::TEAM_PAGE_KEYWORDS as $keyword) {
            if (str_contains($path, $keyword)) {
                $isTeamPage = true;
                break;
            }
        }
        if ($isTeamPage) {
            foreach ($this->extractTeamMembers($dom, $url) as $person) {
                $out['people'][] = $person;
                if ($person['email'] !== null) {
                    $addEmail($person['email'], $person['name']);
                }
            }
        }

        return $out;
    }

    /**
     * @param  array<mixed>  $node
     * @param  array<string, list<mixed>>  $out
     */
    private function walkJsonLd(array $node, string $url, array &$out, callable $addEmail, callable $addPhone, int $depth = 0): void
    {
        if ($depth > 8) {
            return;
        }

        if (array_is_list($node)) {
            foreach ($node as $child) {
                if (is_array($child)) {
                    $this->walkJsonLd($child, $url, $out, $addEmail, $addPhone, $depth + 1);
                }
            }

            return;
        }

        $types = array_map('strval', (array) ($node['@type'] ?? []));
        $isPerson = in_array('Person', $types, true);

        if ($isPerson && is_string($node['name'] ?? null) && trim($node['name']) !== '') {
            $email = is_string($node['email'] ?? null) ? $this->text->normalizeEmail($node['email']) : null;
            $phone = is_string($node['telephone'] ?? null) ? $this->text->cleanPhone($node['telephone']) : null;
            $out['people'][] = [
                'name' => trim($node['name']),
                'title' => trim((string) (is_string($node['jobTitle'] ?? null) ? $node['jobTitle'] : '')),
                'email' => $email,
                'phone' => $phone,
                'source_url' => $url,
            ];
            if ($email !== null) {
                $addEmail($email, trim($node['name']));
            }
        } else {
            foreach ((array) ($node['email'] ?? []) as $email) {
                if (is_string($email)) {
                    $addEmail($email);
                }
            }
            foreach ((array) ($node['telephone'] ?? []) as $phone) {
                if (is_string($phone)) {
                    $addPhone($phone, 'json_ld');
                }
            }
        }

        $address = $node['address'] ?? null;
        if (is_string($address) && trim($address) !== '') {
            $out['addresses'][] = trim($address);
        } elseif (is_array($address) && ! array_is_list($address)) {
            $parts = [];
            foreach (['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry'] as $field) {
                $value = $address[$field] ?? null;
                if (is_array($value)) {
                    $value = $value['name'] ?? null;
                }
                if (is_string($value) && trim($value) !== '') {
                    $parts[] = trim($value);
                }
            }
            if ($parts !== []) {
                $out['addresses'][] = implode(', ', $parts);
            }
        }

        foreach ($node as $key => $child) {
            if ($key === 'address' || ! is_array($child)) {
                continue;
            }
            $this->walkJsonLd($child, $url, $out, $addEmail, $addPhone, $depth + 1);
        }
    }

    /**
     * Name → title line pairs on team/leadership pages, plus any contact
     * details in the following few lines of the same card.
     *
     * @return list<CrawlPerson>
     */
    private function extractTeamMembers(DOMDocument $dom, string $url): array
    {
        $lines = $this->blockLines($dom);
        $people = [];
        $count = count($lines);

        for ($i = 0; $i < $count; $i++) {
            $line = $lines[$i];

            if (preg_match('/^(.{3,60}?)\s*(?:[,|–—-]|\s{2,})\s*(.{2,80})$/u', $line, $match)
                && $this->looksLikePersonName($match[1]) && $this->looksLikeTitle($match[2])) {
                $people[] = $this->personFromCard($match[1], $match[2], array_slice($lines, $i + 1, 3), $url);

                continue;
            }

            if (! $this->looksLikePersonName($line)) {
                continue;
            }

            $next = $lines[$i + 1] ?? '';
            if ($this->looksLikeTitle($next)) {
                $people[] = $this->personFromCard($line, $next, array_slice($lines, $i + 2, 3), $url);
                $i++;
            }
        }

        return $people;
    }

    /**
     * @param  list<string>  $following
     * @return CrawlPerson
     */
    private function personFromCard(string $name, string $title, array $following, string $url): array
    {
        $email = null;
        $phone = null;
        foreach ($following as $line) {
            if ($this->looksLikePersonName($line)) {
                break;
            }
            $email ??= $this->text->extractEmails($line)[0] ?? null;
            $phone ??= $this->text->extractLabelledPhones($line)[0] ?? $this->text->extractInternationalPhones($line)[0] ?? null;
        }

        return [
            'name' => trim($name),
            'title' => mb_substr(trim($title), 0, 120),
            'email' => $email,
            'phone' => $phone,
            'source_url' => $url,
        ];
    }

    private function looksLikePersonName(string $value): bool
    {
        $value = trim($value);
        if (mb_strlen($value) < 4 || mb_strlen($value) > 50 || preg_match('/[\d@:|]/u', $value)) {
            return false;
        }

        $words = preg_split('/\s+/u', $value) ?: [];
        if (count($words) < 2 || count($words) > 4) {
            return false;
        }

        foreach ($words as $word) {
            $bare = trim($word, '.,');
            if (! preg_match('/^\p{Lu}[\p{L}\'’\-.]*$/u', $bare)) {
                return false;
            }
            if (in_array(mb_strtolower($bare), self::TITLE_KEYWORDS, true)
                || in_array(mb_strtolower($bare), ['our', 'the', 'team', 'about', 'meet', 'contact', 'us', 'services', 'leadership', 'management', 'board', 'home', 'read', 'more'], true)) {
                return false;
            }
        }

        return true;
    }

    private function looksLikeTitle(string $value): bool
    {
        $value = mb_strtolower(trim($value));
        if ($value === '' || mb_strlen($value) > 90) {
            return false;
        }

        foreach (self::TITLE_KEYWORDS as $keyword) {
            if (preg_match('/\b'.preg_quote($keyword, '/').'\b/u', $value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Text of leaf-ish block elements in document order.
     *
     * @return list<string>
     */
    private function blockLines(DOMDocument $dom): array
    {
        $xpath = new DOMXPath($dom);
        $nodes = $xpath->query('//body//*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6 or self::p or self::li or self::span or self::strong or self::b or self::em or self::div or self::td or self::a or self::figcaption or self::small][not(ancestor::script) and not(ancestor::style) and not(ancestor::nav) and not(ancestor::footer)]');

        $lines = [];
        $previous = null;
        foreach ($nodes ?: [] as $node) {
            if ($this->hasBlockChild($node)) {
                continue;
            }
            $text = trim((string) preg_replace('/\s+/u', ' ', $node->textContent));
            if ($text === '' || $text === $previous) {
                continue;
            }
            $lines[] = $text;
            $previous = $text;
            if (count($lines) >= 1500) {
                break;
            }
        }

        return $lines;
    }

    private function hasBlockChild(DOMNode $node): bool
    {
        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMElement && in_array(mb_strtolower($child->tagName), ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'div', 'span', 'strong', 'b', 'td', 'a', 'em', 'figcaption', 'small', 'ul', 'ol', 'table'], true)) {
                return true;
            }
        }

        return false;
    }

    private function visibleText(DOMDocument $dom): string
    {
        $clone = clone $dom;
        $xpath = new DOMXPath($clone);
        foreach (iterator_to_array($xpath->query('//script|//style|//noscript|//template|//svg') ?: []) as $node) {
            $node->parentNode?->removeChild($node);
        }

        $parts = [];
        foreach (iterator_to_array($xpath->query('//body//text()') ?: []) as $textNode) {
            $value = trim($textNode->textContent);
            if ($value !== '') {
                $parts[] = $value;
            }
        }

        return trim((string) preg_replace('/\s+/u', ' ', implode("\n", $parts)));
    }

    /**
     * @return CrawlProfile
     */
    private function profileFrom(string $url, ?DOMDocument $dom): array
    {
        if ($dom === null) {
            return array_merge($this->emptyProfile(), ['url' => $url]);
        }

        $title = '';
        $titleNodes = $dom->getElementsByTagName('title');
        if ($titleNodes->length > 0) {
            $title = trim((string) preg_replace('/\s+/u', ' ', $titleNodes->item(0)?->textContent ?? ''));
        }

        $description = '';
        foreach ($dom->getElementsByTagName('meta') as $meta) {
            $name = mb_strtolower($meta->getAttribute('name') ?: $meta->getAttribute('property'));
            if (in_array($name, ['description', 'og:description'], true) && trim($meta->getAttribute('content')) !== '') {
                $description = trim($meta->getAttribute('content'));
                if ($name === 'description') {
                    break;
                }
            }
        }

        return [
            'url' => $url,
            'title' => mb_substr($title, 0, 300),
            'description' => mb_substr($description, 0, 600),
            'excerpt' => mb_substr($this->visibleText($dom), 0, self::EXCERPT_CHARS),
        ];
    }

    /**
     * @return CrawlProfile
     */
    private function emptyProfile(): array
    {
        return ['url' => null, 'title' => '', 'description' => '', 'excerpt' => ''];
    }

    private function loadDom(string $html): ?DOMDocument
    {
        if (trim($html) === '') {
            return null;
        }

        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="utf-8"?>'.$html, LIBXML_NOWARNING | LIBXML_NOERROR | LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return $loaded ? $dom : null;
    }

    private function decodeCloudflareEmail(string $encoded): ?string
    {
        if (! preg_match('/^[a-f0-9]{4,}$/i', $encoded) || strlen($encoded) % 2 !== 0) {
            return null;
        }

        $key = hexdec(substr($encoded, 0, 2));
        $email = '';
        for ($i = 2; $i < strlen($encoded); $i += 2) {
            $email .= chr(hexdec(substr($encoded, $i, 2)) ^ $key);
        }

        return $email;
    }

    /**
     * @param  CrawlPerson  $existing
     * @param  CrawlPerson  $incoming
     * @return CrawlPerson
     */
    private function mergePerson(array $existing, array $incoming): array
    {
        foreach (['title', 'email', 'phone'] as $field) {
            if (($existing[$field] ?? null) === null || $existing[$field] === '') {
                $existing[$field] = $incoming[$field];
            }
        }

        return $existing;
    }

    private function phoneRank(string $kind): int
    {
        return match ($kind) {
            'tel_link' => 0,
            'json_ld' => 1,
            'labelled_text' => 2,
            'whatsapp' => 3,
            default => 4,
        };
    }

    private function normalizeDomain(string $domain): string
    {
        $domain = mb_strtolower(trim($domain));
        $domain = preg_replace('#^[a-z]+://#', '', $domain) ?? $domain;
        $domain = explode('/', $domain)[0];

        return str_starts_with($domain, 'www.') ? mb_substr($domain, 4) : $domain;
    }

    private function crawlCacheKey(string $domain): string
    {
        return 'enrichment:site-crawl:v1:'.$domain;
    }
}
