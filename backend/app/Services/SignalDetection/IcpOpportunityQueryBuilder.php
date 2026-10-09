<?php

namespace App\Services\SignalDetection;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Short, benefit-oriented queries from the active ICP. These always run,
 * even when a signal-type pack is selected.
 */
class IcpOpportunityQueryBuilder
{
    /**
     * @return list<string>
     */
    public function build(IcpBrief $brief): array
    {
        $interest = $this->interest($brief);
        $place = $this->place($brief);
        $angles = [
            'partnership OR launched OR funding',
            'hiring OR expanding OR "looking for"',
            'RFP OR outage OR complaint',
        ];

        $queries = [];
        foreach ($angles as $angle) {
            $queries[] = $this->clip(trim(implode(' ', array_filter([$interest, $place, $angle, 'recent']))));
        }

        foreach (array_slice($brief->searchKeywords, 0, 2) as $keyword) {
            $keyword = $this->clip(trim((string) $keyword), 8);
            if ($keyword === '') {
                continue;
            }
            $queries[] = $this->clip(trim(implode(' ', array_filter([$keyword, $place, 'recent']))));
        }

        $queries = array_values(array_unique(array_filter($queries, static fn (string $q) => $q !== '')));

        return array_slice($queries, 0, 4);
    }

    private function interest(IcpBrief $brief): string
    {
        $raw = trim($brief->customPrompt) !== ''
            ? trim($brief->customPrompt)
            : trim($brief->description);

        if ($raw === '') {
            $raw = trim((string) ($brief->industries[0] ?? ''));
        }

        if ($raw === '') {
            return 'business opportunity';
        }

        return $this->clip($raw, 10);
    }

    private function place(IcpBrief $brief): string
    {
        $places = [];
        foreach (array_slice($brief->territories, 0, 3) as $territory) {
            $head = trim(explode(',', (string) $territory)[0] ?? '');
            if ($head !== '') {
                $places[] = $head;
            }
        }

        $places = array_values(array_unique($places));
        if ($places === []) {
            return '';
        }

        return count($places) === 1 ? $places[0] : '('.implode(' OR ', $places).')';
    }

    private function clip(string $text, int $words = 12): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
        $parts = preg_split('/\s+/u', $text) ?: [];

        return implode(' ', array_slice($parts, 0, $words));
    }
}
