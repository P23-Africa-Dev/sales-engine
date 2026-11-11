<?php

namespace App\Services\Enrichment;

/**
 * Serper /places (Google Maps listings) → company phone, website and address.
 */
class SerperPlacesLookup
{
    public function __construct(
        private readonly SerperClient $serper,
        private readonly DomainResolver $domains,
    ) {}

    public function isEnabled(): bool
    {
        return $this->serper->isConfigured();
    }

    /**
     * @return array{title: string, phone: ?string, website: ?string, address: ?string, source_url: string}|null
     */
    public function lookup(string $company, ?string $location = null): ?array
    {
        $company = trim($company);
        if ($company === '' || ! $this->isEnabled()) {
            return null;
        }

        $query = trim($company.' '.trim((string) $location));
        $response = $this->serper->search(['q' => $query], 'places');
        $places = $response['places'] ?? [];
        if (! is_array($places)) {
            return null;
        }

        $tokens = $this->domains->companyTokens($company);
        foreach (array_slice($places, 0, 5) as $place) {
            if (! is_array($place)) {
                continue;
            }

            $title = trim((string) ($place['title'] ?? ''));
            if ($title === '' || ! $this->titleMatches($title, $tokens)) {
                continue;
            }

            $phone = trim((string) ($place['phoneNumber'] ?? $place['phone'] ?? ''));
            $website = trim((string) ($place['website'] ?? ''));
            $address = trim((string) ($place['address'] ?? ''));
            $cid = (string) ($place['cid'] ?? '');

            return [
                'title' => $title,
                'phone' => $phone !== '' ? $phone : null,
                'website' => $website !== '' ? $website : null,
                'address' => $address !== '' ? $address : null,
                'source_url' => $cid !== '' ? 'https://maps.google.com/?cid='.$cid : 'https://www.google.com/maps/search/'.rawurlencode($query),
            ];
        }

        return null;
    }

    /**
     * @param  list<string>  $tokens
     */
    private function titleMatches(string $title, array $tokens): bool
    {
        if ($tokens === []) {
            return false;
        }

        $placeTokens = $this->domains->companyTokens($title);
        $shared = array_intersect($tokens, $placeTokens);

        return count($shared) >= min(2, count($tokens));
    }
}
