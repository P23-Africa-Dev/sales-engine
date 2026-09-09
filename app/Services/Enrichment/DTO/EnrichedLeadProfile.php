<?php

namespace App\Services\Enrichment\DTO;

readonly class EnrichedLeadProfile
{
    /**
     * @param  list<string>  $profileUrls
     * @param  list<string>  $sourceUrls
     */
    public function __construct(
        public string $title = '',
        public string $companyName = '',
        public string $location = '',
        public string $website = '',
        public string $email = '',
        public string $phone = '',
        public array $profileUrls = [],
        public string $summary = '',
        public string $nextAction = '',
        public array $sourceUrls = [],
        public float $confidence = 0.0,
        public string $contactEnrichmentTier = '',
        public string $contactEnrichmentProvider = '',
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function mergeIntoExtraction(array $extracted): array
    {
        if ($this->title !== '') {
            $extracted['title'] = $this->title;
        }

        if ($this->companyName !== '') {
            $extracted['company'] = $this->companyName;
        }

        if ($this->location !== '') {
            $extracted['location'] = $this->location;
        }

        if ($this->website !== '') {
            $extracted['website'] = $this->website;
        }

        if ($this->email !== '') {
            $extracted['email'] = $this->email;
        }

        if ($this->phone !== '') {
            $extracted['phone'] = $this->phone;
        }

        if ($this->contactEnrichmentTier !== '') {
            $extracted['contact_enrichment_tier'] = $this->contactEnrichmentTier;
        }

        if ($this->contactEnrichmentProvider !== '') {
            $extracted['contact_enrichment_provider'] = $this->contactEnrichmentProvider;
        }

        if ($this->profileUrls !== []) {
            $extracted['profile_urls'] = $this->profileUrls;
            $extracted['linkedin_url'] = $this->profileUrls[0];
        }

        if ($this->summary !== '') {
            $extracted['summary'] = $this->summary;
        }

        if ($this->nextAction !== '') {
            $extracted['next_action'] = $this->nextAction;
        }

        if ($this->sourceUrls !== []) {
            $extracted['source_url'] = $this->sourceUrls[0];
            $fields = is_array($extracted['business_fields'] ?? null) ? $extracted['business_fields'] : [];
            $extracted['business_fields'] = array_merge($fields, ['source_url' => $this->sourceUrls[0]]);
        }

        $extracted['enrichment_confidence'] = $this->confidence;
        $extracted['low_confidence'] = $this->confidence < 40 && ($extracted['low_confidence'] ?? false);

        return $extracted;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'title' => $this->title,
            'company' => $this->companyName,
            'location' => $this->location,
            'website' => $this->website,
            'email' => $this->email,
            'phone' => $this->phone,
            'profile_urls' => $this->profileUrls,
            'summary' => $this->summary,
            'next_action' => $this->nextAction,
            'source_urls' => $this->sourceUrls,
            'enrichment_confidence' => $this->confidence,
            'contact_enrichment_tier' => $this->contactEnrichmentTier,
            'contact_enrichment_provider' => $this->contactEnrichmentProvider,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        $profileUrls = $data['profile_urls'] ?? [];
        $sourceUrls = $data['source_urls'] ?? [];

        return new self(
            title: trim((string) ($data['title'] ?? '')),
            companyName: trim((string) ($data['company'] ?? '')),
            location: trim((string) ($data['location'] ?? '')),
            website: trim((string) ($data['website'] ?? '')),
            email: trim((string) ($data['email'] ?? '')),
            phone: trim((string) ($data['phone'] ?? '')),
            profileUrls: is_array($profileUrls) ? array_values(array_filter($profileUrls, 'is_string')) : [],
            summary: trim((string) ($data['summary'] ?? '')),
            nextAction: trim((string) ($data['next_action'] ?? '')),
            sourceUrls: is_array($sourceUrls) ? array_values(array_filter($sourceUrls, 'is_string')) : [],
            confidence: (float) ($data['enrichment_confidence'] ?? 0),
            contactEnrichmentTier: trim((string) ($data['contact_enrichment_tier'] ?? '')),
            contactEnrichmentProvider: trim((string) ($data['contact_enrichment_provider'] ?? '')),
        );
    }
}
