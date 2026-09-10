<?php

namespace App\Services\Discovery\DTO;

use App\Services\Discovery\QueryIntentService;

readonly class IcpBrief
{
    /**
     * @param  list<string>  $industries
     * @param  list<string>  $territories
     * @param  list<string>  $companySizes
     * @param  list<string>  $decisionMakers
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
        );
    }

    public function isPeopleSearch(): bool
    {
        return $this->target === QueryIntentService::TARGET_PEOPLE;
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

            if ($this->isPeopleSearch()) {
                // Keep primary query free-tier friendly (no nested OR / heavy quotes).
                return trim($cleaned).' CEO founder managing director';
            }

            return $cleaned;
        }

        return $this->icpFallbackSearchQuery();
    }

    private function icpFallbackSearchQuery(): string
    {
        $decisionMakerHint = implode(' ', array_slice($this->decisionMakers, 0, 2));

        $parts = array_filter([
            implode(' ', array_slice($this->industries, 0, 2)),
            implode(' ', array_slice($this->territories, 0, 2)),
            $this->isPeopleSearch()
                ? ($decisionMakerHint !== '' ? $decisionMakerHint : 'executives founders')
                : ($decisionMakerHint !== '' ? $decisionMakerHint . ' companies' : 'companies distributors'),
        ]);

        return trim(implode(' ', $parts));
    }
}
