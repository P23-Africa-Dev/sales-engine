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
                static fn (string $pack) => $pack !== '',
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
        $cleaned = $queryIntent->stripProspectCountInstruction($this->query);

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
            static fn ($pack) => is_string($pack) && trim($pack) !== '',
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

                return trim($cleaned).' CEO founder managing director';
            }

            return $cleaned;
        }

        return $this->interestSearchSeed();
    }

    /**
     * Interest language for search — customPrompt / description only.
     * Firmographic ICP fields are never part of this string.
     */
    public function interestSearchSeed(): string
    {
        $interest = trim($this->customPrompt) !== ''
            ? trim($this->customPrompt)
            : trim($this->description);

        if ($interest !== '') {
            return $interest;
        }

        return $this->isPeopleSearch()
            ? 'executives founders companies announcements'
            : 'companies announcements partnerships market entry';
    }
}
