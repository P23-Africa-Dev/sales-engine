<?php

namespace App\Services\Enrichment;

/**
 * Who a company is, from public sources: industry, employee range, headquarters and
 * (rarely) revenue. Reads the company's LinkedIn page snippet and the search knowledge
 * panel, matched on the company's name so another firm's page is never used. All lookups
 * for a run go out in one pooled search; responses are cached by SerperClient.
 *
 * @phpstan-type Firmographics array{
 *     industry: ?string,
 *     employees_min: ?int,
 *     employees_max: ?int,
 *     employee_range: ?string,
 *     headquarters: ?string,
 *     revenue: ?string,
 *     linkedin_url: ?string,
 *     website: ?string,
 *     sources: list<string>
 * }
 */
class CompanyFirmographicsResolver
{
    public function __construct(
        private readonly SerperClient $serper,
        private readonly DomainResolver $domains,
    ) {}

    /**
     * @param  list<string>  $companies
     * @return array<string, Firmographics> Keyed by the company name as given.
     */
    public function resolveMany(array $companies): array
    {
        $companies = array_values(array_unique(array_filter(array_map('trim', $companies), fn (string $c): bool => $c !== '')));
        $result = [];
        foreach ($companies as $company) {
            $result[$company] = self::empty();
        }
        if ($companies === [] || ! $this->serper->isConfigured()) {
            return $result;
        }

        // LinkedIn's company facts ("Company size: 201-500 employees. Headquarters: …") show up
        // in snippets for a plain facts query; the quoted name brings the knowledge panel and
        // LinkedIn's "Industry. City, Region · N followers" line.
        $payloads = [];
        foreach ($companies as $company) {
            $payloads[] = ['q' => $company.' company size employees industry headquarters', 'num' => 6];
            $payloads[] = ['q' => '"'.$company.'"', 'num' => 6];
        }
        $responses = $this->serper->searchMany($payloads);

        foreach ($companies as $index => $company) {
            $facts = $responses[$index * 2] ?? [];
            $named = $responses[$index * 2 + 1] ?? [];
            $rows = array_merge((array) ($facts['organic'] ?? []), (array) ($named['organic'] ?? []));
            $result[$company] = $this->merge(
                $this->merge($this->fromLinkedIn($company, $rows), $this->fromKnowledgePanel($company, $named)),
                $this->fromDataSites($company, $rows),
            );
        }

        return $result;
    }

    /**
     * @return Firmographics
     */
    public static function empty(): array
    {
        return [
            'industry' => null,
            'employees_min' => null,
            'employees_max' => null,
            'employee_range' => null,
            'headquarters' => null,
            'revenue' => null,
            'linkedin_url' => null,
            'website' => null,
            'sources' => [],
        ];
    }

    /**
     * "201-500" → [201, 500], "10,001+" → [10001, null], "3,000" → [3000, 3000].
     *
     * @return array{0: ?int, 1: ?int}
     */
    public static function parseEmployeeRange(?string $text): array
    {
        $text = str_replace([',', ' '], '', mb_strtolower((string) $text));
        if (preg_match('/(\d+)[-–](\d+)/', $text, $m)) {
            return [(int) $m[1], (int) $m[2]];
        }
        if (preg_match('/(\d+)\+/', $text, $m)) {
            return [(int) $m[1], null];
        }
        if (preg_match('/(\d+)/', $text, $m)) {
            return [(int) $m[1], (int) $m[1]];
        }

        return [null, null];
    }

    /**
     * The company's own LinkedIn page snippets, in any of the shapes search shows them:
     *   "Industry: Machinery Manufacturing · Company size: 201-500 employees · Headquarters: Stuttgart"
     *   "Company size: 1,001-5,000 employees. Headquarters: Rochester, New York. Type …"
     *   "Manufacturing Company size 201-500 employees Headquarters Mombasa, Coast. Primary …"
     *   "Mzuri Sweets Ltd. Food and Beverage Manufacturing. Mombasa, Coast 11,033 followers."
     *
     * @param  list<array<string, mixed>>  $rows
     * @return Firmographics
     */
    private function fromLinkedIn(string $company, array $rows): array
    {
        $data = self::empty();
        foreach ($rows as $row) {
            $url = (string) ($row['link'] ?? '');
            if (! preg_match('~linkedin\.com/company/~i', $url) || ! $this->namesCompany((string) ($row['title'] ?? ''), $company)) {
                continue;
            }

            $snippet = trim((string) preg_replace('/\s+/u', ' ', (string) ($row['snippet'] ?? '')));
            $data['linkedin_url'] ??= strtok($url, '?') ?: $url;
            $data['sources'][] = $url;

            if ($data['industry'] === null && preg_match('/Industry:?\s+([A-Z][^.·;|]+?)(?=\s*(?:[.·;|]|Company size|Headquarters|$))/u', $snippet, $m)) {
                $data['industry'] = trim($m[1]);
            }
            if ($data['industry'] === null && preg_match('/^(?:[^.]*\.\s+)?([A-Z][A-Za-z&,\- ]{2,60}?)\s+Company size/u', $snippet, $m)) {
                $data['industry'] = trim($m[1], ' ,');
            }
            if ($data['employee_range'] === null && preg_match('/Company size:?\s+([\d,]+\s*[-–]\s*[\d,]+|[\d,]+\+)\s*employees/iu', $snippet, $m)) {
                $data['employee_range'] = (string) preg_replace('/\s+/', '', $m[1]);
            }
            if ($data['headquarters'] === null && preg_match('/Headquarters:?\s+([A-Z][^.·;|]+?)(?=\s*(?:[.·;|]|Type|Primary|Founded|Company size|Industry|Specialties|$))/u', $snippet, $m)) {
                $data['headquarters'] = trim($m[1], ' ,');
            }
            // "Name. Industry. City, Region 11,033 followers."
            if (preg_match('/^[^.]+\.\s+([A-Z][A-Za-z&,\- ]{2,60}?)\.\s+([A-Z][^.]{1,60}?)\s+[\d,.]+K?\s+followers/u', $snippet, $m)) {
                $data['industry'] ??= trim($m[1], ' ,');
                $data['headquarters'] ??= trim($m[2], ' ,');
            }
        }
        $data['sources'] = array_values(array_unique($data['sources']));

        return $data;
    }

    /**
     * Employee counts from company-data sites (ZoomInfo, Revelio, …) when LinkedIn gave none.
     * Less reliable than LinkedIn, so only the headcount is taken, and only for this company.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return Firmographics
     */
    private function fromDataSites(string $company, array $rows): array
    {
        $data = self::empty();
        foreach ($rows as $row) {
            $url = (string) ($row['link'] ?? '');
            if (preg_match('~linkedin\.com/~i', $url) || ! $this->namesCompany((string) ($row['title'] ?? ''), $company)) {
                continue;
            }
            $snippet = (string) ($row['snippet'] ?? '');
            if (preg_match('/has\s+([\d,]+\s*[-–]\s*[\d,]+|[\d,]+\+?)\s+employees/iu', $snippet, $m)
                || preg_match('/employs\s+([\d,]+)\s+people/iu', $snippet, $m)
                || preg_match('/with\s+([\d,]+\s*[-–]\s*[\d,]+)\s+employees/iu', $snippet, $m)) {
                $data['employee_range'] = (string) preg_replace('/\s+/', '', $m[1]);
                $data['sources'][] = $url;
                break;
            }
        }

        return $data;
    }

    /**
     * @param  array<string, mixed>  $response
     * @return Firmographics
     */
    private function fromKnowledgePanel(string $company, array $response): array
    {
        $data = self::empty();
        $graph = $response['knowledgeGraph'] ?? null;
        if (! is_array($graph) || ! $this->namesCompany((string) ($graph['title'] ?? ''), $company)) {
            return $data;
        }

        $attributes = is_array($graph['attributes'] ?? null) ? $graph['attributes'] : [];
        foreach ($attributes as $key => $value) {
            $key = mb_strtolower((string) $key);
            $value = trim(is_scalar($value) ? (string) $value : '');
            if ($value === '') {
                continue;
            }
            if (str_contains($key, 'employees')) {
                $data['employee_range'] = $value;
            } elseif (str_contains($key, 'headquarters')) {
                $data['headquarters'] = $value;
            } elseif (str_contains($key, 'revenue')) {
                $data['revenue'] = $value;
            } elseif ($key === 'industry') {
                $data['industry'] = $value;
            }
        }
        $type = trim((string) ($graph['type'] ?? ''));
        if ($data['industry'] === null && $type !== '' && ! preg_match('/^(company|organization|corporation|business)$/i', $type)) {
            $data['industry'] = $type;
        }
        $website = trim((string) ($graph['website'] ?? ''));
        if ($website !== '') {
            $data['website'] = $website;
            $data['sources'][] = $website;
        }

        return $data;
    }

    /**
     * LinkedIn first (it states industry/size consistently); the knowledge panel fills gaps.
     *
     * @param  Firmographics  $primary
     * @param  Firmographics  $secondary
     * @return Firmographics
     */
    private function merge(array $primary, array $secondary): array
    {
        $merged = $primary;
        foreach (['industry', 'employee_range', 'headquarters', 'revenue', 'linkedin_url', 'website'] as $field) {
            $merged[$field] ??= $secondary[$field];
        }
        $merged['sources'] = array_values(array_unique(array_merge($primary['sources'], $secondary['sources'])));
        [$merged['employees_min'], $merged['employees_max']] = self::parseEmployeeRange($merged['employee_range']);

        return $merged;
    }

    /**
     * The page or panel is about this company: every distinctive word of the name appears
     * in its title ("Acme Manufacturing GmbH | LinkedIn" for "Acme Manufacturing").
     */
    private function namesCompany(string $title, string $company): bool
    {
        $tokens = $this->domains->companyTokens($company);
        if ($tokens === []) {
            return false;
        }
        $haystack = ' '.implode(' ', $this->domains->companyTokens($title)).' ';

        foreach ($tokens as $token) {
            if (! str_contains($haystack, ' '.$token.' ')) {
                return false;
            }
        }

        return true;
    }
}
