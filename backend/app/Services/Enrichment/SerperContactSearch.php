<?php

namespace App\Services\Enrichment;

use App\Models\Organization;

/**
 * Open-web contact lookup through Serper: mentions of "@domain", the site's
 * own contact pages, the person + domain/company, and social-profile bios.
 */
class SerperContactSearch
{
    public function __construct(
        private readonly SerperClient $serper,
        private readonly ContactTextExtractor $text,
        private readonly SnippetContactExtractor $snippetExtractor,
    ) {}

    public function isEnabled(): bool
    {
        return $this->serper->isConfigured();
    }

    /**
     * @return array{
     *     person_email: ?array{value: string, source_url: string},
     *     person_phone: ?array{value: string, source_url: string},
     *     domain_emails: list<array{value: string, source_url: string}>,
     *     company_phones: list<array{value: string, source_url: string}>,
     *     linkedin_url: ?string,
     *     queries: int
     * }
     */
    public function search(?Organization $organization, ?string $domain, ?string $company, ?string $personName): array
    {
        $result = [
            'person_email' => null,
            'person_phone' => null,
            'domain_emails' => [],
            'company_phones' => [],
            'linkedin_url' => null,
            'queries' => 0,
        ];

        if (! $this->isEnabled()) {
            return $result;
        }

        $domain = filled($domain) ? mb_strtolower(trim((string) $domain)) : null;
        $company = filled($company) ? trim((string) $company) : null;
        $personName = filled($personName) ? trim((string) $personName) : null;

        $queries = [];
        if ($domain !== null) {
            $queries['domain_mentions'] = '"@'.$domain.'"';
            $queries['site_contact'] = 'site:'.$domain.' email OR contact';
        }
        if ($personName !== null && $domain !== null) {
            $queries['person_domain'] = '"'.$personName.'" "'.$domain.'"';
        }
        if ($personName !== null && $company !== null) {
            $queries['person_company'] = '"'.$personName.'" email '.$company;
        }
        if ($company !== null) {
            $queries['social_bios'] = 'site:facebook.com OR site:instagram.com OR site:x.com "'.$company.'" phone';
        }

        if ($queries === []) {
            return $result;
        }

        $keys = array_keys($queries);
        $responses = $this->serper->searchMany(array_map(
            fn (string $query): array => ['q' => $query, 'num' => 10],
            array_values($queries),
        ));
        $result['queries'] = count($queries);

        $personSnippets = [];
        $domainEmails = [];
        $companyPhones = [];

        foreach ($responses as $index => $response) {
            $kind = $keys[$index];
            foreach ($this->serper->organicRows($response) as $row) {
                $blob = $row['title'].' '.$row['snippet'];
                $mentionsPerson = $personName !== null && $this->mentionsPerson($blob, $personName);

                foreach ($this->text->extractEmails($blob) as $email) {
                    if ($personName !== null && $result['person_email'] === null
                        && ! $this->text->isGenericEmail($email)
                        && $this->text->emailMatchesPerson($email, $personName)
                        && ($domain === null || $this->text->isOnDomain($email, $domain) || $mentionsPerson)) {
                        $result['person_email'] = ['value' => $email, 'source_url' => $row['url']];
                    }
                    if ($domain !== null && $this->text->isOnDomain($email, $domain)) {
                        $domainEmails[$email] ??= ['value' => $email, 'source_url' => $row['url']];
                    }
                }

                $phones = $this->text->extractLabelledPhones($blob);
                if ($phones === []) {
                    $phones = $this->text->extractInternationalPhones($blob);
                }
                foreach ($phones as $phone) {
                    if ($mentionsPerson && in_array($kind, ['person_domain', 'person_company'], true) && $result['person_phone'] === null) {
                        $result['person_phone'] = ['value' => $phone, 'source_url' => $row['url']];

                        continue;
                    }
                    if ($company !== null && ($kind === 'social_bios' || $kind === 'site_contact' || $this->mentionsCompany($blob, $company))) {
                        $companyPhones[$phone] ??= ['value' => $phone, 'source_url' => $row['url']];
                    }
                }

                if (in_array($kind, ['person_domain', 'person_company'], true)) {
                    $personSnippets[] = ['title' => $row['title'], 'snippet' => $row['snippet'], 'url' => $row['url']];
                }
            }
        }

        if ($personName !== null && $personSnippets !== [] && $organization !== null) {
            $fromSnippets = $this->snippetExtractor->extractFromSnippets($organization, $personName, $company, $personSnippets);
            $email = $fromSnippets['email'] ?? null;
            if ($result['person_email'] === null && is_string($email) && $this->text->emailMatchesPerson($email, $personName)) {
                $result['person_email'] = ['value' => $email, 'source_url' => $this->sourceFor($email, $personSnippets)];
            }
            $result['linkedin_url'] = $fromSnippets['linkedin_url'] ?? null;
        }

        $result['domain_emails'] = array_values($domainEmails);
        $result['company_phones'] = array_values($companyPhones);

        return $result;
    }

    private function mentionsPerson(string $blob, string $personName): bool
    {
        [$first, $last] = $this->text->nameParts($personName);
        $haystack = mb_strtolower($blob);

        return $first !== '' && $last !== ''
            && str_contains($haystack, $first) && str_contains($haystack, $last);
    }

    private function mentionsCompany(string $blob, string $company): bool
    {
        return str_contains(mb_strtolower($blob), mb_strtolower($company));
    }

    /**
     * @param  list<array{title: string, snippet: string, url: string}>  $snippets
     */
    private function sourceFor(string $needle, array $snippets): string
    {
        foreach ($snippets as $snippet) {
            if (str_contains(mb_strtolower($snippet['title'].' '.$snippet['snippet']), mb_strtolower($needle))) {
                return $snippet['url'];
            }
        }

        return $snippets[0]['url'] ?? '';
    }
}
