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
        $intent = app(QueryIntentService::class)->analyze($query, 'generate_leads');

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
            query: $query,
            target: $intent['target'],
            requestedLimit: $intent['limit'],
        );
    }

    public function isPeopleSearch(): bool
    {
        return $this->target === QueryIntentService::TARGET_PEOPLE;
    }

    public function searchQuery(): string
    {
        if (trim($this->query) !== '') {
            if ($this->isPeopleSearch()) {
                return trim($this->query).' site:linkedin.com/in OR "CEO" OR "founder" OR "partnership"';
            }

            return $this->query;
        }

        $parts = array_filter([
            implode(' ', array_slice($this->industries, 0, 2)),
            implode(' ', array_slice($this->territories, 0, 2)),
            $this->isPeopleSearch() ? 'executives founders' : 'companies distributors',
        ]);

        return trim(implode(' ', $parts));
    }
}
