<?php

namespace App\Services\Enrichment\Contracts;

use App\Models\Organization;

interface ContactEnrichmentProviderInterface
{
    public function isEnabled(): bool;

    public function providerName(): string;

    /**
     * @param  array{company?: string, website?: string, linkedin_url?: string, domain?: string}  $context
     * @return array{email?: string, phone?: string, linkedin_url?: string, title?: string, company_name?: string, credits_used?: int}
     */
    public function enrichPerson(Organization $organization, string $personName, array $context = []): array;
}
