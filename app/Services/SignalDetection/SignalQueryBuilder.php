<?php

namespace App\Services\SignalDetection;

use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;

/**
 * Builds dedicated search strings per signal type from the trigger pattern
 * and interest language — never from ICP firmographic filter fields.
 */
class SignalQueryBuilder
{
    /**
     * @return list<string>
     */
    public function buildQueriesForType(SignalTypeDefinition $type, IcpBrief $brief): array
    {
        $recency = $this->recencyPhrase((int) $type->default_recency_window_days);
        $interest = trim($brief->customPrompt) !== ''
            ? trim($brief->customPrompt)
            : trim($brief->description);
        $place = $this->placeHint($type);
        $triggerHint = $this->triggerSnippet($type);

        $primary = trim(implode(' ', array_filter([
            $type->label,
            $triggerHint,
            $place,
            $recency,
        ])));

        $queries = [$primary];

        if ($interest !== '') {
            $queries[] = trim(implode(' ', array_filter([$triggerHint ?: $type->label, $interest, $place, $recency])));
        }

        return array_values(array_unique(array_filter($queries)));
    }

    private function recencyPhrase(int $windowDays): string
    {
        return match (true) {
            $windowDays >= 150 => 'in the last 6 months',
            $windowDays >= 60 => 'in the last 3 months',
            $windowDays >= 21 => 'in the last month',
            default => 'past week OR latest OR just announced',
        };
    }

    private function triggerSnippet(SignalTypeDefinition $type): string
    {
        $text = trim((string) $type->trigger_description);
        if ($text === '') {
            return '';
        }

        $sentence = preg_split('/(?<=[.!?])\s+/u', $text)[0] ?? $text;

        return mb_strlen($sentence) > 140 ? mb_substr($sentence, 0, 140) : $sentence;
    }

    /**
     * Only include a place when the type itself is place-scoped (Lagos pack,
     * or the trigger already names a geography). Never dump ICP territories.
     */
    private function placeHint(SignalTypeDefinition $type): string
    {
        if ($type->pack === SignalTypeDefinition::PACK_LAGOS_CORPORATE_TRANSPORT) {
            return 'Lagos';
        }

        $haystack = mb_strtolower($type->trigger_description.' '.$type->label);
        foreach (['lagos', 'kenya', 'nigeria', 'africa', 'uk', 'united states'] as $place) {
            if (str_contains($haystack, $place)) {
                return $place;
            }
        }

        return '';
    }
}
