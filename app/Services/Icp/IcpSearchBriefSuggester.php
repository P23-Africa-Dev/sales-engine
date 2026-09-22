<?php

namespace App\Services\Icp;

use App\Models\Organization;
use App\Services\Discovery\DiscoveryGeo;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Log;

/**
 * Turns ICP chips into a search-ready brief for “What we search for”.
 * Territory, size, revenue, and job titles stay out of the string.
 */
class IcpSearchBriefSuggester
{
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
    ];

    public function __construct(
        private readonly GlmClient $glm,
        private readonly DiscoveryGeo $discoveryGeo = new DiscoveryGeo,
    ) {}

    /**
     * @param  array{
     *     mode?: string,
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
                    'max_tokens' => 220,
                    'temperature' => $mode === 'regenerate' ? 0.7 : 0.25,
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

        if (in_array($mode, ['improve', 'regenerate'], true) && $existing !== '' && ! $this->looksLikeDefinition($existing)) {
            $seed = $existing;
        } else {
            $seed = $this->seedFromIndustries($this->stringList($input['industries'] ?? []));
            $description = trim((string) ($input['description'] ?? ''));
            if ($seed === '' && $description !== '' && ! $this->looksLikeDefinition($description)) {
                $seed = $description;
            }
            if ($seed === '' && $existing !== '' && ! $this->looksLikeDefinition($existing)) {
                $seed = $existing;
            }
        }

        if ($seed === '') {
            $seed = 'B2B companies buyers products';
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
        $brief = $this->cleanPhrase((string) ($draft['brief'] ?? ''), $input);
        $keywords = [];
        $rawKeywords = is_array($draft['keywords'] ?? null) ? $draft['keywords'] : [];
        foreach ($rawKeywords as $keyword) {
            if (! is_string($keyword)) {
                continue;
            }
            $cleaned = $this->cleanPhrase($keyword, $input);
            if ($cleaned === '' || in_array($cleaned, $keywords, true)) {
                continue;
            }
            $keywords[] = $cleaned;
            if (count($keywords) >= 6) {
                break;
            }
        }

        if ($keywords === [] && $brief !== '') {
            $keywords = $this->keywordsFromBrief($brief);
        }

        return ['brief' => $brief, 'keywords' => $keywords];
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function cleanPhrase(string $text, array $input): string
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
        if (count($tokens) > 14) {
            $phrase = implode(' ', array_slice($tokens, 0, 14));
        }
        if (mb_strlen($phrase) > 140) {
            $phrase = rtrim(mb_substr($phrase, 0, 137)).'…';
        }

        return trim($phrase);
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
            if (count($picked) >= 5) {
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
            'current_brief' => trim((string) ($input['customPrompt'] ?? '')),
            'description' => trim((string) ($input['description'] ?? '')),
            'industries' => $this->stringList($input['industries'] ?? []),
            'heuristic_fallback' => $fallbackBrief,
        ];

        $instruction = match ($mode) {
            'improve' => 'Rewrite the current brief into a sharper web-search phrase. Keep the same niche.',
            'regenerate' => 'Write a different phrasing of the same niche. Do not copy the current brief.',
            default => 'Write a web-search phrase for prospect discovery from the industries and description.',
        };

        return [
            [
                'role' => 'system',
                'content' => implode("\n", [
                    'You write short Google-style search phrases for B2B lead discovery.',
                    'Return JSON only: {"brief":"string","keywords":["string"]}',
                    'brief: 6 to 12 words. Products, buyers, and exclusions only.',
                    'keywords: 3 to 6 concrete nouns or short compounds (3PL, last-mile, e-commerce).',
                    'NEVER include countries, cities, ISO codes, company size, revenue, or job titles.',
                    'NEVER write “industries specialize”, profile blurbs, or marketing slogans.',
                    'Territory is applied separately — leave geography out.',
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
