<?php

namespace App\Services\Icp;

use App\Models\Organization;
use App\Services\Discovery\DiscoveryGeo;
use Illuminate\Support\Facades\Log;
use App\Services\Llm\GlmClient;

/**
 * Turns ICP fields into a search-ready brief for “What we search for”.
 * Territory, size, revenue, and job titles stay out of the string.
 *
 * Generate — build from name/description/industries when the box is empty.
 * Improve — rewrite whatever is in the box into a sharper Serper phrase.
 * Regenerate — same niche, different angle / phrasing.
 */
class IcpSearchBriefSuggester
{
    private const MAX_BRIEF_WORDS = 40;

    private const MAX_KEYWORDS = 12;

    private const PERSONA_STOP = [
        'ceo', 'cto', 'cfo', 'coo', 'founder', 'cofounder', 'director', 'manager',
        'head', 'vp', 'vice', 'president', 'officer', 'persona', 'title',
    ];

    /**
     * @var array<string, string>
     */
    private const INDUSTRY_SEEDS = [
        'logistics' => '3PL warehousing last-mile delivery',
        'fleet' => '3PL freight fleet operators',
        'fmcg' => 'FMCG distributors wholesale retail chains',
        'retail' => 'retail distributors supermarket chains',
        'fintech' => 'payments processors lending platforms',
        'payment' => 'payments processors merchant acquiring',
        'health' => 'healthcare distributors pharmacies clinics',
        'pharma' => 'pharma distributors hospital suppliers',
        'manufactur' => 'industrial manufacturers plant equipment',
        'energy' => 'energy utilities power distributors',
        'utilit' => 'utilities power water distributors',
        'construction' => 'construction contractors developers',
        'real estate' => 'property developers commercial real estate',
        'agro' => 'agribusiness commodity traders processors',
        'commodit' => 'commodity traders agribusiness processors',
        'software' => 'SaaS platforms software vendors product companies',
        'tech' => 'technology product companies software platforms',
        'saas' => 'SaaS platforms B2B software vendors',
        'develop' => 'software product companies engineering platforms',
        'mobile' => 'mobile app product companies digital platforms',
        'digital' => 'digital product companies online platforms',
        'bank' => 'banks lending institutions financial services',
        'insur' => 'insurers brokers underwriting carriers',
        'telecom' => 'telecom operators network providers',
        'educat' => 'edtech schools training providers',
        'media' => 'media publishers content platforms',
    ];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    /**
     * @param  array{
     *     mode?: string,
     *     profileName?: string,
     *     customPrompt?: string,
     *     description?: string,
     *     industries?: list<string>,
     *     territories?: list<string>,
     *     decisionMakers?: list<string>
     * }  $input
     * @return array{brief: string, keywords: list<string>, source: string}
     */
    public function suggest(Organization $organization, array $input): array
    {
        $mode = $this->normalizeMode((string) ($input['mode'] ?? 'generate'));
        $existing = trim((string) ($input['customPrompt'] ?? ''));

        // Empty box + Improve → Generate from other ICP fields.
        if ($mode === 'improve' && $existing === '') {
            $mode = 'generate';
            $input['mode'] = 'generate';
        }

        $heuristic = $this->deterministic($input);

        if (! $this->glm->isConfigured()) {
            return $heuristic + ['source' => 'heuristic'];
        }

        try {
            $json = $this->glm->chatJson(
                $this->messages($mode, $input, $heuristic['brief']),
                'chat',
                $organization,
                [
                    'max_tokens' => 280,
                    'temperature' => $mode === 'regenerate' ? 0.75 : ($mode === 'improve' ? 0.35 : 0.25),
                    'timeout' => 25,
                ],
            );
            $draft = [
                'brief' => is_string($json['brief'] ?? null) ? $json['brief'] : '',
                'keywords' => is_array($json['keywords'] ?? null) ? $json['keywords'] : [],
            ];
            $clean = $this->sanitize($draft, $input);
            if ($clean['brief'] === '') {
                return $heuristic + ['source' => 'heuristic'];
            }

            // Improve must stay grounded in the user's draft when they typed something.
            if ($mode === 'improve' && $existing !== '' && ! $this->sharesConcreteNouns($existing, $clean['brief'])) {
                $fallback = $this->sanitize(['brief' => $this->tightenExisting($existing, $input), 'keywords' => $clean['keywords']], $input);
                if ($fallback['brief'] !== '') {
                    return $fallback + ['source' => 'heuristic'];
                }
            }

            return $clean + ['source' => 'glm'];
        } catch (\Throwable $e) {
            Log::debug('ICP search-brief suggest fell back to heuristic', [
                'error' => $e->getMessage(),
            ]);

            return $heuristic + ['source' => 'heuristic'];
        }
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{brief: string, keywords: list<string>}
     */
    public function deterministic(array $input): array
    {
        $existing = trim((string) ($input['customPrompt'] ?? ''));
        $mode = $this->normalizeMode((string) ($input['mode'] ?? 'generate'));

        $seed = match ($mode) {
            'improve' => $existing !== '' && ! $this->looksLikeDefinition($existing)
                ? $this->tightenExisting($existing, $input)
                : $this->composeFromIcpFields($input),
            'regenerate' => $this->alternateSeed($input, $existing),
            default => $existing !== '' && ! $this->looksLikeDefinition($existing)
                ? $this->tightenExisting($existing, $input)
                : $this->composeFromIcpFields($input),
        };

        if ($seed === '') {
            $seed = 'B2B product companies buyers';
        }

        return $this->sanitize(['brief' => $seed, 'keywords' => []], $input);
    }

    /**
     * @param  array{brief?: mixed, keywords?: mixed}  $draft
     * @param  array<string, mixed>  $input
     * @return array{brief: string, keywords: list<string>}
     */
    public function sanitize(array $draft, array $input): array
    {
        $brief = $this->cleanPhrase((string) ($draft['brief'] ?? ''), $input, self::MAX_BRIEF_WORDS);
        $keywords = [];
        $rawKeywords = is_array($draft['keywords'] ?? null) ? $draft['keywords'] : [];
        foreach ($rawKeywords as $keyword) {
            if (! is_string($keyword)) {
                continue;
            }
            $cleaned = $this->cleanPhrase($keyword, $input, 6);
            if ($cleaned === '' || in_array($cleaned, $keywords, true)) {
                continue;
            }
            $keywords[] = $cleaned;
            if (count($keywords) >= self::MAX_KEYWORDS) {
                break;
            }
        }

        if (count($keywords) < 4 && $brief !== '') {
            foreach ($this->keywordsFromBrief($brief) as $keyword) {
                if (! in_array($keyword, $keywords, true)) {
                    $keywords[] = $keyword;
                }
                if (count($keywords) >= self::MAX_KEYWORDS) {
                    break;
                }
            }
        }

        // Pad from industry seeds so the UI can keep offering chips.
        if (count($keywords) < self::MAX_KEYWORDS) {
            foreach ($this->keywordPoolFromIndustries($this->stringList($input['industries'] ?? [])) as $keyword) {
                $cleaned = $this->cleanPhrase($keyword, $input, 6);
                if ($cleaned === '' || in_array($cleaned, $keywords, true)) {
                    continue;
                }
                $keywords[] = $cleaned;
                if (count($keywords) >= self::MAX_KEYWORDS) {
                    break;
                }
            }
        }

        return ['brief' => $brief, 'keywords' => $keywords];
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function composeFromIcpFields(array $input): string
    {
        $parts = [];
        $industrySeed = $this->seedFromIndustries($this->stringList($input['industries'] ?? []));
        if ($industrySeed !== '') {
            $parts[] = $industrySeed;
        }

        $description = trim((string) ($input['description'] ?? ''));
        if ($description !== '' && ! $this->looksLikeDefinition($description)) {
            $nouns = $this->concreteNouns($description, 8);
            if ($nouns !== '') {
                $parts[] = $nouns;
            }
        }

        $name = trim((string) ($input['profileName'] ?? ''));
        if ($name !== '' && count($parts) < 1) {
            $nouns = $this->concreteNouns($name, 4);
            if ($nouns !== '') {
                $parts[] = $nouns;
            }
        }

        $joined = trim(implode('; ', array_values(array_unique(array_filter($parts)))));

        return $joined;
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function tightenExisting(string $existing, array $input): string
    {
        $existing = trim(preg_replace('/\s+/u', ' ', $existing) ?? $existing);
        if ($this->looksLikeDefinition($existing)) {
            return $this->composeFromIcpFields($input);
        }

        $industrySeed = $this->seedFromIndustries($this->stringList($input['industries'] ?? []));
        if ($industrySeed === '') {
            return $existing;
        }

        // If the draft is thin, fold in missing industry nouns.
        $existingLower = mb_strtolower($existing);
        $extras = [];
        foreach (preg_split('/\s+/u', $industrySeed) ?: [] as $token) {
            $plain = mb_strtolower(trim($token));
            if (mb_strlen($plain) < 3 || str_contains($existingLower, $plain)) {
                continue;
            }
            $extras[] = $token;
            if (count($extras) >= 3) {
                break;
            }
        }

        if ($extras === []) {
            return $existing;
        }

        return trim($existing.' '.implode(' ', $extras));
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function alternateSeed(array $input, string $existing): string
    {
        $composed = $this->composeFromIcpFields($input);
        if ($composed === '' && $existing !== '') {
            return $this->tightenExisting($existing, $input);
        }
        if ($existing !== '' && mb_strtolower($composed) === mb_strtolower($existing)) {
            // Flip clause order or lean on description nouns.
            $description = trim((string) ($input['description'] ?? ''));
            $nouns = $this->concreteNouns($description, 6);
            if ($nouns !== '' && ! str_contains(mb_strtolower($composed), mb_strtolower(explode(' ', $nouns)[0] ?? ''))) {
                return trim($nouns.'; '.$composed);
            }
            $parts = array_values(array_filter(array_map('trim', explode(';', $composed))));
            if (count($parts) > 1) {
                return implode('; ', array_reverse($parts));
            }
        }

        return $composed !== '' ? $composed : $this->tightenExisting($existing, $input);
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function cleanPhrase(string $text, array $input, int $maxWords = self::MAX_BRIEF_WORDS): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        $text = trim($text, " \t\n\r\0\x0B\"'`.,;:|-");
        if ($text === '' || $this->looksLikeDefinition($text)) {
            return '';
        }

        $stop = $this->stopTokens($input);
        $words = preg_split('/\s+/u', $text) ?: [];
        $kept = [];
        foreach ($words as $word) {
            $plain = mb_strtolower(trim($word, " \t\n\r\0\x0B.,;:\"'()"));
            $plain = preg_replace('/[^a-z0-9\-&]/u', '', $plain) ?? $plain;
            $stem = preg_replace('/s$/u', '', $plain) ?? $plain;
            if ($plain === '' || isset($stop[$plain]) || isset($stop[$stem])) {
                continue;
            }
            $kept[] = $word;
        }

        $phrase = trim(implode(' ', $kept));
        $phrase = preg_replace('/\s+/u', ' ', $phrase) ?? $phrase;
        $tokens = preg_split('/\s+/u', $phrase) ?: [];
        if (count($tokens) > $maxWords) {
            $phrase = implode(' ', array_slice($tokens, 0, $maxWords));
        }
        if (mb_strlen($phrase) > 220) {
            $phrase = rtrim(mb_substr($phrase, 0, 217)).'…';
        }

        return trim($phrase);
    }

    private function concreteNouns(string $source, int $limit = 6): string
    {
        $fillers = [
            'and', 'the', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'our',
            'companies', 'company', 'business', 'businesses', 'industries', 'industry',
            'specialize', 'looking', 'target', 'objective', 'profile', 'description',
            'expanding', 'enterprise', 'operations', 'providers', 'provider',
        ];
        $picked = [];
        foreach (preg_split('/[^\p{L}\p{N}\-&]+/u', mb_strtolower($source)) ?: [] as $token) {
            $token = trim($token);
            if (mb_strlen($token) < 4 || in_array($token, $fillers, true) || isset($picked[$token])) {
                continue;
            }
            $picked[$token] = $token;
            if (count($picked) >= $limit) {
                break;
            }
        }

        return implode(' ', array_values($picked));
    }

    private function sharesConcreteNouns(string $a, string $b): bool
    {
        $aNouns = array_filter(explode(' ', $this->concreteNouns($a, 8)));
        $bLower = mb_strtolower($b);
        foreach ($aNouns as $noun) {
            if (str_contains($bLower, $noun)) {
                return true;
            }
        }

        return $aNouns === [];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, true>
     */
    private function stopTokens(array $input): array
    {
        $stop = [];
        foreach ($this->discoveryGeo->geoStopTokens() as $token) {
            $stop[$token] = true;
        }
        foreach (self::PERSONA_STOP as $token) {
            $stop[$token] = true;
        }
        foreach (['industries', 'specialize', 'industry', 'persona', 'personas'] as $token) {
            $stop[$token] = true;
        }
        foreach (array_merge(
            $this->stringList($input['territories'] ?? []),
            $this->stringList($input['decisionMakers'] ?? []),
        ) as $value) {
            foreach (preg_split('/[^\p{L}\p{N}\-&]+/u', mb_strtolower($value)) ?: [] as $part) {
                if (mb_strlen($part) >= 3) {
                    $stop[$part] = true;
                }
            }
        }

        return $stop;
    }

    /**
     * @param  list<string>  $industries
     */
    private function seedFromIndustries(array $industries): string
    {
        $parts = [];
        foreach ($industries as $industry) {
            $lower = mb_strtolower($industry);
            $matched = false;
            foreach (self::INDUSTRY_SEEDS as $needle => $seed) {
                if (str_contains($lower, $needle)) {
                    $parts[] = $seed;
                    $matched = true;
                    break;
                }
            }
            if (! $matched) {
                $nouns = trim(preg_replace('/[&,\/]+/u', ' ', $industry) ?? $industry);
                if ($nouns !== '') {
                    $parts[] = $nouns.' companies';
                }
            }
        }

        $parts = array_values(array_unique($parts));

        return implode(' ', array_slice($parts, 0, 2));
    }

    /**
     * @param  list<string>  $industries
     * @return list<string>
     */
    private function keywordPoolFromIndustries(array $industries): array
    {
        $out = [];
        foreach ($industries as $industry) {
            $lower = mb_strtolower($industry);
            foreach (self::INDUSTRY_SEEDS as $needle => $seed) {
                if (! str_contains($lower, $needle)) {
                    continue;
                }
                foreach (preg_split('/\s+/u', $seed) ?: [] as $token) {
                    $token = trim($token);
                    if (mb_strlen($token) >= 3) {
                        $out[] = $token;
                    }
                }
                // Also offer 2-word compounds from the seed.
                $words = preg_split('/\s+/u', $seed) ?: [];
                for ($i = 0; $i < count($words) - 1; $i++) {
                    $out[] = $words[$i].' '.$words[$i + 1];
                }
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * @return list<string>
     */
    private function keywordsFromBrief(string $brief): array
    {
        $fillers = ['and', 'the', 'for', 'with', 'from', 'into', 'that', 'this', 'companies', 'company'];
        $picked = [];
        foreach (preg_split('/[^\p{L}\p{N}\-&]+/u', mb_strtolower($brief)) ?: [] as $token) {
            $token = trim($token);
            if (mb_strlen($token) < 3 || in_array($token, $fillers, true) || isset($picked[$token])) {
                continue;
            }
            $picked[$token] = $token;
            if (count($picked) >= 8) {
                break;
            }
        }

        return array_values($picked);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return list<array{role: string, content: string}>
     */
    private function messages(string $mode, array $input, string $fallbackBrief): array
    {
        $payload = [
            'mode' => $mode,
            'profile_name' => trim((string) ($input['profileName'] ?? '')),
            'current_brief' => trim((string) ($input['customPrompt'] ?? '')),
            'description' => trim((string) ($input['description'] ?? '')),
            'industries' => $this->stringList($input['industries'] ?? []),
            'heuristic_fallback' => $fallbackBrief,
        ];

        $instruction = match ($mode) {
            'improve' => 'Rewrite current_brief into the best Serper search brief for this ICP. Keep the user\'s niche nouns. Make it entity-first (companies, products, buyers, exclusions). Max 40 words. Prefer 1–3 short clauses separated by commas or semicolons.',
            'regenerate' => 'Write a different Serper search brief for the same ICP niche. Do not copy current_brief. Use another angle on products/buyers from industries and description. Max 40 words.',
            default => 'Write a Serper search brief from profile_name, description, and industries. The opportunity box may be empty — invent the best searchable niche phrase for this ICP. Max 40 words. Entity-first only.',
        };

        return [
            [
                'role' => 'system',
                'content' => implode("\n", [
                    'You write short Google-style search phrases for B2B lead discovery (Serper).',
                    'Return JSON only: {"brief":"string","keywords":["string"]}',
                    'brief: up to 40 words; prefer 6–14 word clauses; products, buyers, exclusions.',
                    'keywords: 6 to 12 concrete add-on chips (single words or 2-word compounds like last-mile, 3PL).',
                    'NEVER include countries, cities, ISO codes, company size, revenue, or job titles.',
                    'NEVER write “industries specialize”, profile blurbs, or marketing slogans.',
                    'Territory is applied separately — leave geography out.',
                    'Your job is to refine so web search returns real companies/people, not essays.',
                ]),
            ],
            [
                'role' => 'user',
                'content' => $instruction."\n".json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ],
        ];
    }

    private function looksLikeDefinition(string $text): bool
    {
        return (bool) preg_match('/industries specialize/i', $text);
    }

    private function normalizeMode(string $mode): string
    {
        $mode = mb_strtolower(trim($mode));

        return in_array($mode, ['generate', 'improve', 'regenerate'], true) ? $mode : 'generate';
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $item) {
            if (! is_string($item)) {
                continue;
            }
            $trimmed = trim($item);
            if ($trimmed !== '') {
                $out[] = $trimmed;
            }
        }

        return array_values(array_unique($out));
    }
}
