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
        public int $requestedLimit = 8,
    ) {}

    public static function fromIcpProfile(\App\Models\IcpProfile $profile, string $query = ''): self
    {
        $config = $profile->config ?? [];
        $queryIntent = app(QueryIntentService::class);
        $cleanedQuery = $queryIntent->stripProspectCountInstruction($query);
        $intent = $queryIntent->analyze($cleanedQuery, 'generate_leads');

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
            target: $intent['target'],
            requestedLimit: $intent['limit'],
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
        $queryIntent = app(QueryIntentService::class);
        $cleaned = $queryIntent->stripProspectCountInstruction($this->query);

        if (trim($cleaned) !== '' && ! $queryIntent->isGenericLeadRequest($cleaned)) {
            if ($this->isAuthoritativePeopleQuery()) {
                return trim($cleaned) . ' Forbes Bloomberg billionaires richest people world ranking list';
            }

            if ($this->isPeopleSearch()) {
                return trim($cleaned) . ' site:linkedin.com/in OR "CEO" OR "founder" OR "partnership"';
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
