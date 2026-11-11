<?php

namespace App\Services\Enrichment;

/**
 * Learns a company's mailbox convention (first.last, flast, …) from personal
 * emails already found on its domain and applies it to a named person.
 * Only DNS MX is checked — never SMTP probing.
 */
class EmailPatternInferer
{
    public const PATTERNS = [
        'first.last', 'firstlast', 'flast', 'f.last', 'firstl', 'first', 'last',
        'first_last', 'first-last', 'last.first', 'lastfirst', 'lastf',
    ];

    public function __construct(
        private readonly ContactTextExtractor $text,
        private readonly MxRecordChecker $mx,
    ) {}

    /**
     * @param  list<array{email: string, name?: ?string}>  $knownEmails
     */
    public function learnPattern(string $domain, array $knownEmails): ?string
    {
        $votes = [];

        foreach ($knownEmails as $known) {
            $email = $this->text->normalizeEmail($known['email'] ?? null);
            if ($email === null || ! $this->text->isOnDomain($email, $domain) || $this->text->isGenericEmail($email)) {
                continue;
            }

            $local = explode('@', $email)[0];
            $name = trim((string) ($known['name'] ?? ''));
            $pattern = $name !== '' ? $this->patternForName($local, $name) : $this->patternFromShape($local);
            if ($pattern !== null) {
                $votes[$pattern] = ($votes[$pattern] ?? 0) + ($name !== '' ? 2 : 1);
            }
        }

        if ($votes === []) {
            return null;
        }

        arsort($votes);

        return (string) array_key_first($votes);
    }

    public function generate(string $personName, string $pattern, string $domain): ?string
    {
        [$first, $last] = $this->text->nameParts($personName);
        if ($first === '' || ($last === '' && ! in_array($pattern, ['first'], true))) {
            return null;
        }

        $local = match ($pattern) {
            'first.last' => $first.'.'.$last,
            'firstlast' => $first.$last,
            'flast' => $first[0].$last,
            'f.last' => $first[0].'.'.$last,
            'firstl' => $first.$last[0],
            'first' => $first,
            'last' => $last,
            'first_last' => $first.'_'.$last,
            'first-last' => $first.'-'.$last,
            'last.first' => $last.'.'.$first,
            'lastfirst' => $last.$first,
            'lastf' => $last.$first[0],
            default => null,
        };

        return $local !== null ? $this->text->normalizeEmail($local.'@'.mb_strtolower($domain)) : null;
    }

    /**
     * @param  list<array{email: string, name?: ?string}>  $knownEmails
     * @return array{email: string, pattern: string}|null
     */
    public function infer(string $personName, string $domain, array $knownEmails): ?array
    {
        $pattern = $this->learnPattern($domain, $knownEmails);
        if ($pattern === null) {
            return null;
        }

        $email = $this->generate($personName, $pattern, $domain);
        if ($email === null || ! $this->mx->hasMx($domain)) {
            return null;
        }

        return ['email' => $email, 'pattern' => $pattern];
    }

    private function patternForName(string $local, string $name): ?string
    {
        foreach (self::PATTERNS as $pattern) {
            $candidate = $this->generate($name, $pattern, 'x.invalid');
            if ($candidate !== null && explode('@', $candidate)[0] === $local) {
                return $pattern;
            }
        }

        return null;
    }

    /**
     * Without a name only separator-delimited locals are unambiguous enough.
     */
    private function patternFromShape(string $local): ?string
    {
        return match (true) {
            (bool) preg_match('/^[a-z]{2,}\.[a-z]{2,}$/', $local) => 'first.last',
            (bool) preg_match('/^[a-z]{2,}_[a-z]{2,}$/', $local) => 'first_last',
            (bool) preg_match('/^[a-z]{2,}-[a-z]{2,}$/', $local) => 'first-last',
            (bool) preg_match('/^[a-z]\.[a-z]{2,}$/', $local) => 'f.last',
            default => null,
        };
    }
}
