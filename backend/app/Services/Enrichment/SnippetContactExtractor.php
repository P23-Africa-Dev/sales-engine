<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Log;

class SnippetContactExtractor
{
    private const GENERIC_EMAIL_LOCAL_PARTS = [
        'info', 'contact', 'support', 'sales', 'hello', 'admin', 'office',
        'enquiries', 'inquiry', 'help', 'noreply', 'no-reply', 'marketing',
        'press', 'media', 'hr', 'jobs', 'careers', 'team', 'mail',
    ];

    public function __construct(
        private readonly GlmClient $glm,
    ) {}

    /**
     * Extract contactable email/phone from Serper snippets for a named person.
     *
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     * @return array{email?: string, phone?: string, linkedin_url?: string, confidence?: float}
     */
    public function extractFromSnippets(
        Organization $organization,
        string $personName,
        ?string $company,
        array $snippets,
    ): array {
        if ($snippets === []) {
            return [];
        }

        $textBlob = $this->buildTextBlob($snippets);
        $regexHits = $this->regexExtract($textBlob);

        $glmHits = [];
        if ($this->glm->isConfigured()) {
            $glmHits = $this->glmExtract($organization, $personName, $company, $snippets);
        }

        $email = $this->preferEmail(
            $this->sanitizeEmail($glmHits['email'] ?? null),
            $this->sanitizeEmail($regexHits['email'] ?? null),
            $company,
        );

        $phone = $this->sanitizePhone($glmHits['phone'] ?? null)
            ?? $this->sanitizePhone($regexHits['phone'] ?? null);

        $linkedin = $this->sanitizeLinkedIn($glmHits['linkedin_url'] ?? null)
            ?? $this->sanitizeLinkedIn($regexHits['linkedin_url'] ?? null)
            ?? $this->firstLinkedInFromSnippets($snippets);

        $out = array_filter([
            'email' => $email,
            'phone' => $phone,
            'linkedin_url' => $linkedin,
        ], fn ($v) => is_string($v) && $v !== '');

        if ($out !== []) {
            $out['confidence'] = isset($glmHits['email']) || isset($glmHits['phone']) ? 70.0 : 55.0;
        }

        return $out;
    }

    /**
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     */
    private function buildTextBlob(array $snippets): string
    {
        $parts = [];
        foreach ($snippets as $snippet) {
            $parts[] = trim((string) ($snippet['title'] ?? ''));
            $parts[] = trim((string) ($snippet['snippet'] ?? ''));
            $parts[] = trim((string) ($snippet['url'] ?? ''));
        }

        return implode("\n", array_filter($parts, fn (string $p) => $p !== ''));
    }

    /**
     * @return array{email?: string, phone?: string, linkedin_url?: string}
     */
    private function regexExtract(string $text): array
    {
        $out = [];

        if (preg_match('/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/', $text, $m)) {
            $email = $this->sanitizeEmail($m[0]);
            if ($email !== null) {
                $out['email'] = $email;
            }
        }

        if (preg_match('/(?:\+|00)?\d[\d\s().\-]{6,18}\d/', $text, $m)) {
            $phone = $this->sanitizePhone($m[0]);
            if ($phone !== null) {
                $out['phone'] = $phone;
            }
        }

        if (preg_match('#https?://(?:www\.)?linkedin\.com/in/[^\s/"\'<>]+#i', $text, $m)) {
            $linkedin = $this->sanitizeLinkedIn($m[0]);
            if ($linkedin !== null) {
                $out['linkedin_url'] = $linkedin;
            }
        }

        return $out;
    }

    /**
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     * @return array{email?: string, phone?: string, linkedin_url?: string}
     */
    private function glmExtract(
        Organization $organization,
        string $personName,
        ?string $company,
        array $snippets,
    ): array {
        try {
            $result = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Extract contact details for ONE named person from search snippets. Return JSON keys: email (work email preferred; empty if none or generic mailbox like info@/contact@/support@), phone (direct/mobile preferred; empty if none), linkedin_url (linkedin.com/in/ only; empty if none), confidence (0-100). Only use facts present in the snippets — never invent emails or phones. No markdown.',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'person_name' => $personName,
                        'company' => $company,
                        'snippets' => array_slice($snippets, 0, 6),
                    ], JSON_UNESCAPED_UNICODE),
                ],
            ], 'extract', $organization);

            return array_filter([
                'email' => $this->sanitizeEmail(isset($result['email']) ? (string) $result['email'] : null),
                'phone' => $this->sanitizePhone(isset($result['phone']) ? (string) $result['phone'] : null),
                'linkedin_url' => $this->sanitizeLinkedIn(isset($result['linkedin_url']) ? (string) $result['linkedin_url'] : null),
            ], fn ($v) => is_string($v) && $v !== '');
        } catch (\Throwable $e) {
            Log::warning('Snippet contact GLM extraction failed', [
                'person' => $personName,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function preferEmail(?string $primary, ?string $fallback, ?string $company): ?string
    {
        foreach ([$primary, $fallback] as $email) {
            if ($email === null) {
                continue;
            }
            if ($company !== null && $company !== '' && $this->emailLooksWorkRelated($email, $company)) {
                return $email;
            }
        }

        return $primary ?? $fallback;
    }

    private function emailLooksWorkRelated(string $email, string $company): bool
    {
        $domain = mb_strtolower((string) substr(strrchr($email, '@') ?: '', 1));
        $slug = mb_strtolower(preg_replace('/[^a-z0-9]+/u', '', $company) ?? '');

        return $slug !== '' && $domain !== '' && str_contains($domain, $slug);
    }

    public function sanitizeEmail(?string $email): ?string
    {
        $email = trim(mb_strtolower((string) $email));
        if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        $local = explode('@', $email)[0] ?? '';
        if (in_array($local, self::GENERIC_EMAIL_LOCAL_PARTS, true)) {
            return null;
        }

        return $email;
    }

    public function sanitizePhone(?string $phone): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '' || str_contains($phone, '@') || preg_match('/^https?:\/\//i', $phone)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 7 || strlen($digits) > 15) {
            return null;
        }

        return mb_substr($phone, 0, 40);
    }

    public function sanitizeLinkedIn(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return null;
        }

        if (! preg_match('/^https?:\/\//i', $url)) {
            $url = 'https://'.$url;
        }

        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) parse_url($url, PHP_URL_PATH);
        if (! str_contains($host, 'linkedin.com') || ! str_contains(mb_strtolower($path), '/in/')) {
            return null;
        }

        return $url;
    }

    /**
     * @param  list<array{title?: string, snippet?: ?string, url?: ?string}>  $snippets
     */
    private function firstLinkedInFromSnippets(array $snippets): ?string
    {
        foreach ($snippets as $snippet) {
            $url = $this->sanitizeLinkedIn(isset($snippet['url']) ? (string) $snippet['url'] : null);
            if ($url !== null) {
                return $url;
            }
        }

        return null;
    }
}
