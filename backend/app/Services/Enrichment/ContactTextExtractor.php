<?php

namespace App\Services\Enrichment;

use Illuminate\Support\Str;

/**
 * Regex helpers shared by the website crawler and Serper contact search:
 * plain + obfuscated emails, labelled phone numbers, email classification
 * and name ↔ email matching. Pure string logic, no I/O.
 */
class ContactTextExtractor
{
    /**
     * Mailboxes that belong to the company, never to a specific person.
     */
    public const GENERIC_EMAIL_LOCAL_PARTS = [
        'info', 'contact', 'contacts', 'contactus', 'support', 'sales', 'hello', 'hi', 'admin', 'office',
        'enquiries', 'enquiry', 'inquiries', 'inquiry', 'help', 'helpdesk', 'noreply', 'no-reply',
        'donotreply', 'do-not-reply', 'marketing', 'press', 'media', 'pr', 'hr', 'jobs', 'careers',
        'recruitment', 'team', 'mail', 'email', 'general', 'accounts', 'accounting', 'billing',
        'finance', 'service', 'services', 'customerservice', 'customercare', 'care', 'feedback',
        'webmaster', 'postmaster', 'hostmaster', 'abuse', 'privacy', 'legal', 'compliance',
        'reception', 'bookings', 'booking', 'reservations', 'orders', 'order', 'shop', 'store',
        'partners', 'partnerships', 'business', 'biz', 'customers', 'operations', 'ops', 'it',
        'security', 'newsletter', 'news', 'events', 'hq', 'main', 'enquire', 'askus', 'ask',
    ];

    /**
     * Addresses that leak into page source but never reach a human at the company.
     */
    private const JUNK_EMAIL_DOMAINS = [
        'example.com', 'example.org', 'domain.com', 'yourdomain.com', 'email.com', 'company.com',
        'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com', 'sentry.wixpress.com',
        'mysite.com', 'yoursite.com', 'test.com', 'godaddy.com', 'w3.org', 'schema.org',
    ];

    private const ASSET_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.ico'];

    private const PHONE_LABEL_PATTERN = '/(?:tel(?:ephone)?|phone|call(?:\s+us)?|mobile|mob|cell|hotline|whats\s?app|ph|t)\s*(?:no\.?|number|#)?\s*[.:\-–]?\s*((?:\+|00)?\(?\d[\d\s().\-\/]{5,20}\d)/iu';

    /**
     * @return list<string>
     */
    public function extractEmails(string $text): array
    {
        $found = [];

        if (preg_match_all('/[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,24}/', $text, $matches)) {
            foreach ($matches[0] as $candidate) {
                $found[] = $candidate;
            }
        }

        foreach ($this->extractObfuscatedEmails($text) as $candidate) {
            $found[] = $candidate;
        }

        return $this->uniqueValidEmails($found);
    }

    /**
     * "jane [at] acme [dot] com", "jane(at)acme(dot)co(dot)uk", "jane AT acme DOT com".
     *
     * @return list<string>
     */
    public function extractObfuscatedEmails(string $text): array
    {
        $at = '\s*(?:[\[\(\{<]\s*(?:at|AT|@)\s*[\]\)\}>]|\sAT\s)\s*';
        $dot = '\s*(?:[\[\(\{<]\s*(?:dot|DOT|\.)\s*[\]\)\}>]|\sDOT\s)\s*';

        $found = [];
        $pattern = '/([a-zA-Z0-9][a-zA-Z0-9._%+\-]*)'.$at.'([a-zA-Z0-9\-]+(?:(?:'.$dot.'|\.)[a-zA-Z0-9\-]+)*(?:'.$dot.'|\.)[a-zA-Z]{2,24})\b/u';

        if (preg_match_all($pattern, $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $domain = preg_replace('/'.$dot.'/u', '.', $match[2]) ?? $match[2];
                $domain = preg_replace('/\s+/u', '', $domain) ?? $domain;
                $found[] = $match[1].'@'.$domain;
            }
        }

        return $this->uniqueValidEmails($found);
    }

    /**
     * Phone numbers that follow a Tel/Phone/Call style label.
     *
     * @return list<string>
     */
    public function extractLabelledPhones(string $text): array
    {
        $found = [];

        if (preg_match_all(self::PHONE_LABEL_PATTERN, $text, $matches)) {
            foreach ($matches[1] as $candidate) {
                $phone = $this->cleanPhone($candidate);
                if ($phone !== null) {
                    $found[$phone] = $phone;
                }
            }
        }

        return array_values($found);
    }

    /**
     * Any international-looking number (+CC …) — used for snippets where labels are often dropped.
     *
     * @return list<string>
     */
    public function extractInternationalPhones(string $text): array
    {
        $found = [];

        if (preg_match_all('/(?<![\w+])\+\d[\d\s().\-]{6,18}\d/u', $text, $matches)) {
            foreach ($matches[0] as $candidate) {
                $phone = $this->cleanPhone($candidate);
                if ($phone !== null) {
                    $found[$phone] = $phone;
                }
            }
        }

        return array_values($found);
    }

    public function cleanPhone(?string $phone): ?string
    {
        $phone = trim((string) $phone, " \t\n\r\0\x0B.-/");
        if ($phone === '') {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 7 || strlen($digits) > 15) {
            return null;
        }

        // Reject years / date ranges such as "2019-2024" and long runs of the same digit.
        if (preg_match('/^(19|20)\d{2}\D+(19|20)\d{2}$/', $phone) || preg_match('/^(\d)\1+$/', $digits)) {
            return null;
        }

        return mb_substr(preg_replace('/\s+/u', ' ', $phone) ?? $phone, 0, 40);
    }

    public function normalizeEmail(?string $email): ?string
    {
        $email = mb_strtolower(trim((string) $email, " \t\n\r\0\x0B.,;:<>()[]\"'"));
        $email = preg_replace('/^mailto:/i', '', $email) ?? $email;
        $email = explode('?', $email)[0];

        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        [$local, $domain] = explode('@', $email, 2);
        foreach (self::ASSET_SUFFIXES as $suffix) {
            if (str_ends_with($domain, $suffix)) {
                return null;
            }
        }

        if (in_array($domain, self::JUNK_EMAIL_DOMAINS, true) || str_ends_with($domain, '.wixpress.com')) {
            return null;
        }

        if (preg_match('/^[a-f0-9]{24,}$/', $local)) {
            return null;
        }

        return $email;
    }

    public function isGenericEmail(string $email): bool
    {
        $local = mb_strtolower(explode('@', $email)[0] ?? '');
        $local = preg_replace('/[0-9]+$/', '', $local) ?? $local;

        return in_array($local, self::GENERIC_EMAIL_LOCAL_PARTS, true)
            || in_array(str_replace(['.', '_', '-'], '', $local), self::GENERIC_EMAIL_LOCAL_PARTS, true);
    }

    public function emailDomain(string $email): string
    {
        return mb_strtolower((string) substr(strrchr($email, '@') ?: '', 1));
    }

    public function isOnDomain(string $email, ?string $domain): bool
    {
        if ($domain === null || $domain === '') {
            return false;
        }

        $emailDomain = $this->emailDomain($email);
        $domain = mb_strtolower($domain);

        return $emailDomain === $domain || str_ends_with($emailDomain, '.'.$domain);
    }

    /**
     * Does the local part of the email plausibly belong to this person?
     */
    public function emailMatchesPerson(string $email, string $personName): bool
    {
        [$first, $last] = $this->nameParts($personName);
        if ($first === '') {
            return false;
        }

        $local = preg_replace('/[^a-z]/', '', mb_strtolower(explode('@', $email)[0] ?? '')) ?? '';
        if ($local === '') {
            return false;
        }

        if ($last !== '' && mb_strlen($last) >= 3 && str_contains($local, $last)) {
            return true;
        }

        if (mb_strlen($first) >= 3 && str_contains($local, $first)) {
            return true;
        }

        return $last !== '' && in_array($local, [$first[0].$last, $first.$last[0]], true);
    }

    /**
     * ASCII, lower-cased first and last name with honorifics/suffixes removed.
     *
     * @return array{0: string, 1: string}
     */
    public function nameParts(string $personName): array
    {
        $clean = mb_strtolower(Str::ascii(trim($personName)));
        $clean = preg_replace('/\([^)]*\)/', ' ', $clean) ?? $clean;
        $tokens = preg_split('/[\s,]+/', $clean) ?: [];

        $skip = ['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'sir', 'engr', 'chief', 'jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'mba', 'md', 'esq', 'cpa'];
        $parts = [];
        foreach ($tokens as $token) {
            $token = preg_replace('/[^a-z\-]/', '', $token) ?? '';
            $token = trim($token, '-');
            if ($token === '' || in_array($token, $skip, true)) {
                continue;
            }
            $parts[] = $token;
        }

        if ($parts === []) {
            return ['', ''];
        }

        $first = str_replace('-', '', $parts[0]);
        $last = count($parts) > 1 ? str_replace('-', '', $parts[count($parts) - 1]) : '';

        return [$first, $last];
    }

    /**
     * @param  list<string>  $candidates
     * @return list<string>
     */
    private function uniqueValidEmails(array $candidates): array
    {
        $out = [];
        foreach ($candidates as $candidate) {
            $email = $this->normalizeEmail($candidate);
            if ($email !== null) {
                $out[$email] = $email;
            }
        }

        return array_values($out);
    }
}
