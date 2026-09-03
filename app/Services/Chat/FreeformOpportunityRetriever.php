<?php

namespace App\Services\Chat;

use App\Models\ApiUsage;
use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialSignal;
use App\Models\User;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FreeformOpportunityRetriever
{
    private const MAX_SERPER_QUERIES = 3;

    private const MAX_SOURCES = 10;

    public function __construct(
        private readonly GlmClient $glm,
        private readonly IcpChatContextBuilder $icpChatContext,
        private readonly ChatListNumbering $numbering,
    ) {}

    public function isEnabled(): bool
    {
        return trim((string) config('services.serper.api_key')) !== '';
    }

    /**
     * @return array{body: string, sources: list<array{title: string, url: ?string, snippet: ?string, provider: string}>}
     */
    public function answer(
        Organization $organization,
        ?IcpProfile $icp,
        string $userQuery,
        User $user,
        ?string $clientTimezone = null,
    ): array {
        $queries = $this->buildSearchQueries($icp, $userQuery);
        $webSources = $this->searchWeb($organization, $queries);
        $socialSources = $this->recentSocialSignals($organization, $icp);
        $sources = array_slice(array_merge($webSources, $socialSources), 0, self::MAX_SOURCES);

        $firstName = trim(explode(' ', trim($user->name ?? ''), 2)[0] ?? '');
        $system = $this->icpChatContext->buildFreeformSystemPrompt($icp, $firstName, $clientTimezone);
        $system .= "\n\nYou have LIVE retrieved sources below. Prefer them over generic knowledge."
            . "\nRules for sourced answers:"
            . "\n- Lead with concrete opportunities/news/plays found in the sources (or say clearly when sources are thin)."
            . "\n- Number items sequentially as 1. 2. 3. (never repeat 1.)."
            . "\n- For each item include: what it is, why it fits the active ICP, and a markdown link to the source URL when available."
            . "\n- Do not invent URLs. Only use URLs from the provided sources."
            . "\n- End with \"Based on your active ICP\" recommendations grounded in both ICP and sources.";

        $userPayload = json_encode([
            'user_question' => $userQuery,
            'active_icp' => $this->icpChatContext->toPromptPayload($icp),
            'retrieved_sources' => $sources,
        ], JSON_UNESCAPED_UNICODE);

        if (! $this->glm->isConfigured()) {
            return [
                'body' => $this->fallbackFromSources($sources, $icp),
                'sources' => $sources,
            ];
        }

        try {
            $raw = $this->glm->chat([
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $userPayload ?: $userQuery],
            ], 'chat', $organization);

            return [
                'body' => $this->numbering->normalize($raw),
                'sources' => $sources,
            ];
        } catch (\Throwable $e) {
            Log::warning('Freeform opportunity synthesis failed', ['error' => $e->getMessage()]);

            return [
                'body' => $this->fallbackFromSources($sources, $icp),
                'sources' => $sources,
            ];
        }
    }

    /**
     * @return list<string>
     */
    private function buildSearchQueries(?IcpProfile $icp, string $userQuery): array
    {
        $payload = $this->icpChatContext->toPromptPayload($icp);
        $industry = is_array($payload['industries'] ?? null) ? ($payload['industries'][0] ?? '') : '';
        $territory = is_array($payload['territories'] ?? null) ? ($payload['territories'][0] ?? '') : '';
        $buyer = is_array($payload['decision_makers'] ?? null) ? ($payload['decision_makers'][0] ?? '') : '';

        $base = trim($userQuery);
        $queries = [
            trim(implode(' ', array_filter([$base, $industry, $territory, '2024 OR 2025 OR 2026 opportunity OR funding OR partnership OR tender']))),
            trim(implode(' ', array_filter([$industry, $territory, $buyer, 'market opportunity growth investment']))),
            trim(implode(' ', array_filter([$industry, $territory, 'news startups procurement RFP']))),
        ];

        $queries = array_values(array_unique(array_filter($queries, fn(string $q) => mb_strlen($q) >= 8)));

        if ($queries === []) {
            $queries = [$base !== '' ? $base : 'B2B market opportunities'];
        }

        return array_slice($queries, 0, self::MAX_SERPER_QUERIES);
    }

    /**
     * @param  list<string>  $queries
     * @return list<array{title: string, url: ?string, snippet: ?string, provider: string}>
     */
    private function searchWeb(Organization $organization, array $queries): array
    {
        if (! $this->isEnabled()) {
            return [];
        }

        $baseUrl = rtrim((string) config('services.serper.base_url'), '/');
        $sources = [];
        $seen = [];

        foreach ($queries as $query) {
            try {
                $response = Http::timeout(25)
                    ->withHeaders([
                        'X-API-KEY' => (string) config('services.serper.api_key'),
                        'Content-Type' => 'application/json',
                    ])
                    ->post($baseUrl . '/search', [
                        'q' => $query,
                        'num' => 5,
                    ]);

                ApiUsage::query()->create([
                    'organization_id' => $organization->id,
                    'provider' => 'serper',
                    'endpoint' => 'freeform_opportunity',
                    'units' => 1,
                    'estimated_cost' => 0.005,
                    'meta' => ['status' => $response->status(), 'query' => $query],
                ]);

                if (! $response->successful()) {
                    continue;
                }

                foreach ($response->json('organic') ?? [] as $item) {
                    if (! is_array($item)) {
                        continue;
                    }
                    $url = isset($item['link']) ? (string) $item['link'] : null;
                    $key = mb_strtolower($url ?: (string) ($item['title'] ?? ''));
                    if ($key === '' || isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $sources[] = [
                        'title' => (string) ($item['title'] ?? 'Untitled'),
                        'url' => $url,
                        'snippet' => isset($item['snippet']) ? (string) $item['snippet'] : null,
                        'provider' => 'serper',
                    ];
                }
            } catch (\Throwable $e) {
                Log::warning('Freeform Serper search failed', ['error' => $e->getMessage()]);
            }
        }

        return $sources;
    }

    /**
     * @return list<array{title: string, url: ?string, snippet: ?string, provider: string}>
     */
    private function recentSocialSignals(Organization $organization, ?IcpProfile $icp): array
    {
        $query = SocialSignal::query()
            ->where('organization_id', $organization->id)
            ->where('status', '!=', 'dismissed')
            ->orderByDesc('score')
            ->orderByDesc('id')
            ->limit(5);

        if ($icp) {
            $query->where('icp_profile_id', $icp->id);
        }

        $sources = [];
        foreach ($query->get() as $signal) {
            $sources[] = [
                'title' => trim(($signal->company_name ?: $signal->profile_name ?: 'Social signal') . ' — ' . ($signal->intent_label ?: $signal->signal_type ?: 'signal')),
                'url' => $signal->post_url,
                'snippet' => mb_substr((string) $signal->post_text, 0, 280),
                'provider' => 'social_listening',
            ];
        }

        return $sources;
    }

    /**
     * @param  list<array{title: string, url: ?string, snippet: ?string, provider: string}>  $sources
     */
    private function fallbackFromSources(array $sources, ?IcpProfile $icp): string
    {
        if ($sources === []) {
            $icpName = $icp?->name ?? 'your ICP';

            return "I couldn't retrieve live web/social sources right now for {$icpName}. Try Quick Research for a deeper pass, or ask again in a moment.";
        }

        $lines = ['Here are live findings you can review now:', ''];
        $i = 1;
        foreach (array_slice($sources, 0, 6) as $source) {
            $title = $source['title'];
            $url = $source['url'];
            $snippet = $source['snippet'] ?? '';
            $link = $url ? " [Read more]({$url})" : '';
            $lines[] = "{$i}. **{$title}** — {$snippet}{$link}";
            $i++;
        }

        if ($icp) {
            $lines[] = '';
            $lines[] = 'Based on your active ICP';
            $lines[] = 'Prioritize items that match ' . $icp->name . ' industries, territories, and buyer personas above.';
        }

        return $this->numbering->normalize(implode("\n", $lines));
    }
}
