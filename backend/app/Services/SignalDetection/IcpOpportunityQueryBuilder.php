<?php

namespace App\Services\SignalDetection;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;

/**
 * A few buying-intent queries from the listening profile. Funding, hiring,
 * and partnership language are added only when the profile asks for them.
 */
class IcpOpportunityQueryBuilder
{
    /**
     * @return list<string>
     */
    public function build(IcpBrief $brief): array
    {
        return $this->fromProfile(ListeningProfile::fromBrief($brief));
    }

    /**
     * @return list<string>
     */
    public function fromProfile(ListeningProfile $profile): array
    {
        $offer = $profile->offer;
        $place = $this->place($profile->territories);
        $queries = [];

        if ($profile->mode === 'invest') {
            $queries[] = $this->clip(trim("raising OR \"seed round\" OR \"series A\" {$offer} {$place}"));
        } elseif ($profile->mode === 'partner') {
            $queries[] = $this->clip(trim("\"looking for\" partner OR partnership {$offer} {$place}"));
        } else {
            $queries[] = $this->clip(trim("\"recommend\" OR \"anyone use\" OR \"what do you use\" {$offer} {$place}"));
            $queries[] = $this->clip(trim("\"looking for\" OR \"alternative to\" {$offer} -job -hiring -vacancy {$place}"));
            $competitor = $profile->competitors[0] ?? '';
            if ($competitor !== '') {
                $queries[] = $this->clip(trim("switching OR \"frustrated with\" {$competitor} {$offer}"));
            }
        }

        if ($profile->includeHiring) {
            $queries[] = $this->clip(trim("appointed OR hiring {$offer} {$place}"));
        }

        $queries = array_values(array_unique(array_filter($queries, static fn (string $query) => $query !== '')));

        return array_slice($queries, 0, 4);
    }

    /**
     * @param  list<string>  $territories
     */
    private function place(array $territories): string
    {
        $places = array_values(array_unique(array_filter(array_map(
            static fn (string $territory) => trim($territory),
            $territories,
        ))));
        if ($places === []) {
            return '';
        }

        return count($places) === 1 ? $places[0] : '('.implode(' OR ', $places).')';
    }

    private function clip(string $text, int $words = 18): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
        $parts = preg_split('/\s+/u', $text) ?: [];

        return implode(' ', array_slice($parts, 0, $words));
    }
}
