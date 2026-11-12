<?php

namespace App\Services\Enrichment;

use App\Services\Extraction\ExtractionService;

/**
 * Fills a person lead's missing job title and employer before scoring, from that exact
 * person's LinkedIn search result (matched on the profile URL, so it is the same person).
 * One pooled search for the whole batch keeps it to a few seconds. Without this, people
 * found through posts or thin snippets score as "role unknown" and get no company contacts.
 */
class PersonHeadlineResolver
{
    public const DEFAULT_CAP = 12;

    public function __construct(
        private readonly SerperClient $serper,
        private readonly ExtractionService $extraction,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $payloads  Candidate rows (person_name/name, title, company, linkedin_url).
     * @return list<array<string, mixed>> The same rows, with title/company filled where the profile states them.
     */
    public function fill(array $payloads, int $cap = self::DEFAULT_CAP): array
    {
        if (! $this->serper->isConfigured()) {
            return $payloads;
        }

        $targets = [];
        foreach ($payloads as $index => $row) {
            if (count($targets) >= $cap) {
                break;
            }
            $slug = $this->profileSlug((string) ($row['linkedin_url'] ?? ''));
            $missing = trim((string) ($row['title'] ?? '')) === '' || trim((string) ($row['company'] ?? '')) === '';
            if ($slug !== null && $missing) {
                $targets[$index] = $slug;
            }
        }
        if ($targets === []) {
            return $payloads;
        }

        $responses = $this->serper->searchMany(array_values(array_map(
            fn (string $slug): array => ['q' => 'site:linkedin.com/in/'.$slug, 'num' => 5],
            $targets,
        )));

        foreach (array_keys($targets) as $position => $index) {
            $slug = $targets[$index];
            $row = $payloads[$index];
            $name = trim((string) ($row['person_name'] ?? $row['name'] ?? ''));

            foreach ($this->serper->organicRows($responses[$position] ?? []) as $result) {
                if ($this->profileSlug($result['url']) !== $slug) {
                    continue;
                }

                $found = $this->extraction->roleFromProfileResult($result['title'], $result['snippet'], $name);
                if (trim((string) ($row['title'] ?? '')) === '' && filled($found['title'])) {
                    $row['title'] = $found['title'];
                    $row['role_source'] = 'profile_headline';
                }
                if (trim((string) ($row['company'] ?? '')) === '' && filled($found['company'])) {
                    $row['company'] = $found['company'];
                    $row['company_source'] = 'profile_headline';
                }
                break;
            }

            $payloads[$index] = $row;
        }

        return $payloads;
    }

    /**
     * "https://ng.linkedin.com/in/ada-obi-12ab/" → "ada-obi-12ab".
     */
    private function profileSlug(string $url): ?string
    {
        if (! preg_match('~linkedin\.com/in/([^/?#]+)~i', $url, $match)) {
            return null;
        }

        $slug = mb_strtolower(rawurldecode($match[1]));

        return $slug !== '' ? $slug : null;
    }
}
