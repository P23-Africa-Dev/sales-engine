<?php

namespace App\Services\Discovery;

class CompanyNameValidator
{
    /** @var list<string> */
    private const GENERIC_PHRASES = [
        'matching requirement',
        'qualified leads',
        'qualified lead',
        'sales leads',
        'lead generation',
        'lead gen',
        'merger requirement',
        'merger requirements',
    ];

    /** @var list<string> */
    private const BLOCKLIST_TOKENS = [
        'tips', 'tip', 'checklist', 'playbook', 'webinar', 'template', 'roadmap',
        'blueprint', 'strategy', 'strategies', 'framework', 'frameworks', 'award',
        'awards', 'requirement', 'requirements', 'qualified', 'leads', 'lead',
        'matching', 'scaling', 'outreach', 'peer', 'peers', 'group', 'groups',
        'how', 'guide', 'blog', 'article', 'news', 'podcast', 'episode',
        'roles', 'role', 'hiring', 'salary', 'careers', 'jobs', 'signals',
        'signal', 'engine', 'engines',
    ];

    public function __construct(private readonly QueryIntentService $queryIntent) {}

    /**
     * @param  array<string, mixed>  $extracted
     */
    public function isValidCompanyName(string $name, array $extracted = []): bool
    {
        $trimmed = trim($name);
        if ($trimmed === '' || mb_strlen($trimmed) < 2) {
            return false;
        }

        if ($this->queryIntent->looksLikeContentOrGenericPhrase($trimmed)) {
            return false;
        }

        $lower = mb_strtolower($trimmed);
        foreach (self::GENERIC_PHRASES as $phrase) {
            if ($lower === $phrase || str_contains($lower, $phrase)) {
                return false;
            }
        }

        $tokens = preg_split('/\s+/u', $trimmed) ?: [];
        $tokens = array_values(array_filter($tokens, fn (string $t) => $t !== ''));

        if (count($tokens) === 0) {
            return false;
        }

        $blockCount = 0;
        foreach ($tokens as $token) {
            $tokenLower = mb_strtolower(preg_replace('/[^a-z0-9]/u', '', $token) ?? $token);
            if (in_array($tokenLower, self::BLOCKLIST_TOKENS, true)) {
                $blockCount++;
            }
        }

        // Names dominated by content nouns are not companies.
        if ($blockCount > 0 && $blockCount >= (int) ceil(count($tokens) / 2)) {
            return false;
        }

        // Pure numeric + content titles like "500 Qualified Leads Award"
        if (preg_match('/^\d+/u', $trimmed) && $blockCount > 0) {
            return false;
        }

        // Prefer corroboration for short/generic single-token names without a website.
        if (count($tokens) === 1 && mb_strlen($trimmed) < 4) {
            return $this->hasCompanyCorroboration($extracted);
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function hasCompanyCorroboration(array $extracted): bool
    {
        $website = trim((string) ($extracted['website'] ?? ($extracted['business_fields']['website'] ?? '')));
        if ($website !== '') {
            return true;
        }

        $sector = trim((string) ($extracted['sector'] ?? ''));
        $location = trim((string) ($extracted['location'] ?? ''));

        return $sector !== '' || $location !== '';
    }
}
