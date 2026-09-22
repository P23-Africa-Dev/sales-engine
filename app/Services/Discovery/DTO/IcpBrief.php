<?php

namespace App\Services\Discovery\DTO;

use App\Models\SignalTypeDefinition;
use App\Services\Discovery\QueryIntentService;

readonly class IcpBrief
{
    /**
     * @param  list<string>  $industries
     * @param  list<string>  $territories
     * @param  list<string>  $companySizes
     * @param  list<string>  $decisionMakers
     * @param  list<string>  $revenueRanges
     */
    public function __construct(
        public string $name,
        public string $description,
        public array $industries,
        public array $territories,
        public array $companySizes,
        public array $decisionMakers,
        public string $customPrompt,
        public int $minMatchScore,
        public bool $autoSyncCrm,
        public string $query,
        public string $target = 'companies',
        public int $requestedLimit = 20,
        public ?string $searchQueryOverride = null,
        public array $revenueRanges = [],
        /** @var list<string> which signal-type packs (SignalTypeRegistry) this ICP opts into */
        public array $signalTypePacks = [],
    ) {}

    public static function fromIcpProfile(\App\Models\IcpProfile $profile, string $query = ''): self
    {
        $config = $profile->config ?? [];
        $queryIntent = app(QueryIntentService::class);
        // Parse limit from the raw query first so "Find 50 leads" wrappers survive stripping.
        $intent = $queryIntent->analyze($query, 'generate_leads');
        $cleanedQuery = $queryIntent->stripProspectCountInstruction($query);
        $target = $queryIntent->analyze($cleanedQuery, 'generate_leads')['target'];

        return new self(
            name: $profile->name,
            description: (string) ($profile->description ?? ''),
            industries: array_values($config['industries'] ?? []),
            territories: array_values($config['territories'] ?? []),
            companySizes: array_values($config['companySizes'] ?? []),
            decisionMakers: array_values($config['decisionMakers'] ?? []),
            customPrompt: (string) ($config['customPrompt'] ?? ''),
            minMatchScore: (int) ($config['minMatchScore'] ?? 60),
            autoSyncCrm: (bool) ($config['autoSyncCrm'] ?? false),
            query: $cleanedQuery,
            target: $target,
            requestedLimit: $intent['limit'],
            revenueRanges: array_values($config['revenueRanges'] ?? []),
            signalTypePacks: array_values(array_filter(
                array_map('strval', $config['signalTypePacks'] ?? []),
                static fn(string $pack) => $pack !== '',
            )),
        );
    }

    /**
     * Clone with a different discovery target (people ↔ companies rescue pass).
     */
    public function withTarget(string $target): self
    {
        return new self(
            name: $this->name,
            description: $this->description,
            industries: $this->industries,
            territories: $this->territories,
            companySizes: $this->companySizes,
            decisionMakers: $this->decisionMakers,
            customPrompt: $this->customPrompt,
            minMatchScore: $this->minMatchScore,
            autoSyncCrm: $this->autoSyncCrm,
            query: $this->query,
            target: $target,
            requestedLimit: $this->requestedLimit,
            searchQueryOverride: $this->searchQueryOverride,
            revenueRanges: $this->revenueRanges,
            signalTypePacks: $this->signalTypePacks,
        );
    }

    /**
     * Clone with a raw search-query override (used by multi-query fan-out).
     */
    public function withSearchQueryOverride(string $searchQuery): self
    {
        return new self(
            name: $this->name,
            description: $this->description,
            industries: $this->industries,
            territories: $this->territories,
            companySizes: $this->companySizes,
            decisionMakers: $this->decisionMakers,
            customPrompt: $this->customPrompt,
            minMatchScore: $this->minMatchScore,
            autoSyncCrm: $this->autoSyncCrm,
            query: $this->query,
            target: $this->target,
            requestedLimit: $this->requestedLimit,
            searchQueryOverride: $searchQuery,
            revenueRanges: $this->revenueRanges,
            signalTypePacks: $this->signalTypePacks,
        );
    }

    public function isPeopleSearch(): bool
    {
        return $this->target === QueryIntentService::TARGET_PEOPLE;
    }

    public function isCompanySearch(): bool
    {
        return $this->target === QueryIntentService::TARGET_COMPANIES;
    }

    public function isBothSearch(): bool
    {
        return $this->target === QueryIntentService::TARGET_BOTH;
    }

    public function isListiclePeopleQuery(): bool
    {
        return app(QueryIntentService::class)->isListiclePeopleQuery($this->query);
    }

    public function hasUserQuery(): bool
    {
        $queryIntent = app(QueryIntentService::class);
        $cleaned = $queryIntent->stripEntityModeCue(
            $queryIntent->stripProspectCountInstruction($this->query)
        );

        return trim($cleaned) !== '' && ! $queryIntent->isGenericLeadRequest($cleaned);
    }

    public function isAuthoritativePeopleQuery(): bool
    {
        return app(QueryIntentService::class)->isAuthoritativePeopleQuery($this->query);
    }

    /**
     * Packs that should actually run. Empty / missing → Core Buyer Signals.
     * Explicit `none` disables discrete detection.
     *
     * @return list<string>
     */
    public function resolvedSignalTypePacks(): array
    {
        $packs = array_values(array_filter(
            $this->signalTypePacks,
            static fn($pack) => is_string($pack) && trim($pack) !== '',
        ));

        if (in_array(SignalTypeDefinition::PACK_NONE, $packs, true)) {
            return [];
        }

        return $packs === [] ? [SignalTypeDefinition::PACK_DEFAULT] : $packs;
    }

    public function signalTypeDetectionEnabled(): bool
    {
        return $this->resolvedSignalTypePacks() !== [];
    }

    public function searchQuery(): string
    {
        if (filled($this->searchQueryOverride)) {
            return trim((string) $this->searchQueryOverride);
        }

        $queryIntent = app(QueryIntentService::class);
        $cleaned = $queryIntent->stripProspectCountInstruction($this->query);

        if (trim($cleaned) !== '' && ! $queryIntent->isGenericLeadRequest($cleaned)) {
            if ($this->isAuthoritativePeopleQuery()) {
                return trim($cleaned) . ' Forbes Bloomberg billionaires richest people world ranking list';
            }

            if ($this->isPeopleSearch() || $this->isBothSearch()) {
                // Avoid stacking extra titles when the query already names a role.
                if (preg_match('/\b(ceo|cto|cfo|coo|founder|director|manager|head of|vp|president)\b/iu', $cleaned)) {
                    return trim($cleaned);
                }

                // Both-mode default search leans company-first; people pass overrides via withTarget.
                if ($this->isBothSearch()) {
                    return trim($cleaned);
                }

                return trim($cleaned) . ' CEO founder managing director';
            }

            return $cleaned;
        }

        return $this->interestSearchSeed();
    }

    /**
     * Deterministic ICP Search Brief for vague generate requests.
     *
     * Priority: customPrompt → description → industries (soft) → neutral fallback.
     * Territory, size, revenue, and personas stay out of this string (gates only).
     */
    public function searchBrief(): string
    {
        $industries = array_values(array_filter(array_map(
            static fn($industry) => is_string($industry) ? trim($industry) : '',
            $this->industries,
        )));

        $interest = trim($this->customPrompt);
        if ($interest !== '') {
            return $this->entityOrientedSeed($interest, $industries);
        }

        $description = trim($this->description);
        if ($description !== '') {
            return $this->entityOrientedSeed($description, $industries);
        }

        if ($industries !== []) {
            return implode(' ', $industries) . ' companies';
        }

        return $this->isPeopleSearch()
            ? 'executives founders companies announcements'
            : 'companies announcements partnerships market entry';
    }

    /**
     * Compress definition-style ICP essays into short entity search seeds.
     *
     * @param  list<string>  $industries
     */
    private function entityOrientedSeed(string $text, array $industries): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        $words = preg_split('/\s+/u', $text) ?: [];
        if (count($words) <= 14) {
            return $text;
        }

        $nouns = $this->concreteNounsFromText($text, implode(' ', $industries), 6);
        if ($industries !== []) {
            $seed = trim(implode(' ', $industries).' '.$nouns);
            if ($seed !== '') {
                return $this->isPeopleSearch() ? $seed : trim($seed.' companies');
            }
        }

        return implode(' ', array_slice($words, 0, 10));
    }

    /**
     * Pull a few concrete nouns from description that are not already in the seed.
     * Generic — no vertical dictionary.
     */
    private function concreteNounsFromText(string $source, string $alreadyPresent, int $limit = 4): string
    {
        if ($source === '' || $limit < 1) {
            return '';
        }

        $stop = [
            'and',
            'the',
            'for',
            'with',
            'from',
            'into',
            'that',
            'this',
            'your',
            'our',
            'companies',
            'company',
            'business',
            'businesses',
            'focus',
            'looking',
            'signs',
            'showing',
            'any',
            'all',
            'to',
            'of',
            'in',
            'on',
            'or',
            'a',
            'an',
            'profile',
            'description',
            'fallback',
            'about',
            'their',
            'these',
            'those',
            'where',
            'when',
            'what',
            'which',
            'whom',
            'whose',
            'have',
            'has',
            'been',
            'will',
            'would',
            'could',
            'should',
            'also',
            'such',
            'than',
            'then',
            'them',
            'sell',
            'sells',
            'sold',
            'buy',
            'buys',
            'buying',
            'solutions',
            'solution',
            'unused',
            'customprompt',
            'prompt',
            'set',
        ];
        $present = mb_strtolower($alreadyPresent);
        $tokens = preg_split('/[^\p{L}\p{N}\-&]+/u', mb_strtolower($source)) ?: [];
        $picked = [];
        foreach ($tokens as $token) {
            $token = trim($token);
            if (mb_strlen($token) < 4 || in_array($token, $stop, true)) {
                continue;
            }
            if (str_contains($present, $token) || isset($picked[$token])) {
                continue;
            }
            $picked[$token] = $token;
            if (count($picked) >= $limit) {
                break;
            }
        }

        return implode(' ', array_values($picked));
    }

    /**
     * Interest language for search — delegates to searchBrief().
     * Firmographic gates (territory / size / revenue / personas) are never part of this string.
     */
    public function interestSearchSeed(): string
    {
        return $this->searchBrief();
    }
}
