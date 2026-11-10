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
    /** @var list<string> */
    private const DANGLING_WORDS = ['or', 'and', 'a', 'an', 'the', 'of', 'to', 'in', 'into', 'for', 'with', 'by', 'on', 'at', 'from'];

    /**
     * @return list<string>
     */
    /**
     * Recency is not written into the query text: the search call already
     * carries the run's freshness window (Serper `tbs`), and a literal
     * "in the last 6 months" only narrows matches to pages using that phrase.
     */
    public function buildQueriesForType(SignalTypeDefinition $type, IcpBrief $brief): array
    {
        $interest = trim($brief->customPrompt) !== ''
            ? trim($brief->customPrompt)
            : trim($brief->description);
        $place = $this->placeHint($type);
        $triggerHint = $this->triggerSnippet($type);

        $primary = trim(implode(' ', array_filter([
            $type->label,
            $triggerHint,
            $place,
        ])));

        $queries = [$primary];

        if ($interest !== '') {
            $queries[] = trim(implode(' ', array_filter([$triggerHint ?: $type->label, $interest, $place])));
        }

        return array_values(array_unique(array_filter($queries)));
    }

    /**
     * First eight words of the trigger's first sentence, without a dangling
     * "or", "and", comma or similar left by the cut.
     */
    private function triggerSnippet(SignalTypeDefinition $type): string
    {
        $text = trim((string) $type->trigger_description);
        if ($text === '') {
            return '';
        }

        $sentence = preg_split('/(?<=[.!?])\s+/u', $text)[0] ?? $text;
        $words = array_slice(preg_split('/\s+/u', trim($sentence)) ?: [], 0, 8);

        while ($words !== []) {
            $last = rtrim((string) end($words), ',;:.!?');
            if ($last !== '' && ! in_array(mb_strtolower($last), self::DANGLING_WORDS, true)) {
                $words[count($words) - 1] = $last;
                break;
            }
            array_pop($words);
        }

        return implode(' ', $words);
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
