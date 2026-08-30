<?php

namespace App\Services\Discovery\DTO;

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
    ) {}

    public static function fromIcpProfile(\App\Models\IcpProfile $profile, string $query = ''): self
    {
        $config = $profile->config ?? [];

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
        );
    }

    public function searchQuery(): string
    {
        if (trim($this->query) !== '') {
            return $this->query;
        }

        $parts = array_filter([
            implode(' ', array_slice($this->industries, 0, 2)),
            implode(' ', array_slice($this->territories, 0, 2)),
            'companies distributors',
        ]);

        return trim(implode(' ', $parts));
    }
}
