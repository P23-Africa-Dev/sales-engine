<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\ListeningProfile;

/**
 * A post is saved only when the model quotes a sentence that is actually in
 * the text and that sentence is a concrete opening for this listening profile.
 */
class OpportunityGate
{
    public function __construct(
        private readonly OpportunityPrefilter $prefilter = new OpportunityPrefilter,
    ) {}

    /**
     * @param  array<string, mixed>  $enriched
     */
    public function rejection(array $enriched, string $text, ListeningProfile $profile): ?string
    {
        if (($enriched['from_heuristic'] ?? false) === true) {
            return 'not_an_opportunity';
        }

        if (($enriched['actionability'] ?? '') !== 'reply_now') {
            return 'not_an_opportunity';
        }

        $type = mb_strtolower(trim((string) ($enriched['signal_type'] ?? 'other')));
        if (in_array($type, ['', 'other', 'market_signal', 'regulatory_change'], true)) {
            return 'not_an_opportunity';
        }

        if (! $this->typeAllowed($type, $profile)) {
            return 'not_an_opportunity';
        }

        if (! $this->quoteProvesAsk((string) ($enriched['evidence_quote'] ?? ''), $text, $profile, $type)) {
            return 'not_an_opportunity';
        }

        return null;
    }

    private function typeAllowed(string $type, ListeningProfile $profile): bool
    {
        if ($type === 'hiring_expansion') {
            return $profile->includeHiring;
        }

        return match ($profile->mode) {
            'invest' => in_array($type, ['funding_event', 'investment_opportunity'], true),
            'partner' => $type === 'partnership_opportunity',
            default => in_array($type, ['recommendation', 'switching', 'pricing', 'competitive_move'], true),
        };
    }

    private function quoteProvesAsk(string $quote, string $text, ListeningProfile $profile, string $type): bool
    {
        $quote = $this->normalize($quote);
        $haystack = $this->normalize($text);
        if (mb_strlen($quote) < 40 || $haystack === '' || ! str_contains($haystack, $quote)) {
            return false;
        }

        if (preg_match(OpportunityPrefilter::LISTICLE_BLOCK, $quote)) {
            return false;
        }

        if (preg_match('/[?？]/u', $quote)) {
            return true;
        }

        if (preg_match('/\b(i|we|our|anyone)\b/u', $quote)) {
            return true;
        }

        if ($type === 'hiring_expansion' && preg_match(OpportunityPrefilter::HIRING_CUES, $quote)) {
            return true;
        }

        return $this->prefilter->hasCue($quote, $profile);
    }

    private function normalize(string $value): string
    {
        $value = mb_strtolower($value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }
}
