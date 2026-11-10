<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\ListeningProfile;

/**
 * Final keep/drop decision after the model has read a post. A post is saved
 * only when:
 *   - the model judged it a concrete opening this week (reply_now),
 *   - the author is a would-be buyer/partner/founder, not a vendor, recruiter
 *     or news outlet (unless the profile tracks deals, where news counts),
 *   - the opportunity type fits the profile's mode, and
 *   - the model's evidence quote is really in the post and reads as an ask,
 *     a complaint, or a stated need.
 *
 * Quotes are matched after normalising case, punctuation and whitespace, with
 * a word-overlap fallback, because models routinely drop a comma or swap a
 * quote mark — an exact byte match was rejecting real openings.
 */
class OpportunityGate
{
    private const MIN_QUOTE_CHARS = 25;

    private const MIN_TOKEN_OVERLAP = 0.85;

    /** Author roles that are never a buyer-side opening. */
    private const NON_BUYER_ROLES = ['vendor', 'self_promotion', 'recruiter', 'spam', 'bot'];

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

        $role = mb_strtolower(trim((string) ($enriched['author_role'] ?? '')));
        if (in_array($role, self::NON_BUYER_ROLES, true)) {
            return 'not_a_buyer';
        }
        if (in_array($role, ['news', 'media'], true) && $profile->mode === 'sell') {
            return 'not_a_buyer';
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

    /**
     * True when the quote appears in the text, tolerating punctuation,
     * casing, ellipses, and a few dropped words.
     */
    public function quoteIsInText(string $quote, string $text): bool
    {
        $needle = $this->normalize($quote);
        $haystack = $this->normalize($text);
        if (mb_strlen($needle) < self::MIN_QUOTE_CHARS || $haystack === '') {
            return false;
        }

        if (str_contains($haystack, $needle)) {
            return true;
        }

        $quoteTokens = array_values(array_filter(explode(' ', $needle), static fn ($t) => mb_strlen($t) >= 3));
        if (count($quoteTokens) < 5) {
            return false;
        }

        $textTokens = array_flip(explode(' ', $haystack));
        $present = 0;
        foreach ($quoteTokens as $token) {
            if (isset($textTokens[$token])) {
                $present++;
            }
        }

        return ($present / count($quoteTokens)) >= self::MIN_TOKEN_OVERLAP;
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
        if (! $this->quoteIsInText($quote, $text)) {
            return false;
        }

        $quote = mb_strtolower(trim($quote));

        if (preg_match(OpportunityPrefilter::LISTICLE_BLOCK, $quote)) {
            return false;
        }

        if (preg_match('/[?？]/u', $quote)) {
            return true;
        }

        if (preg_match('/\b(i|i\'m|i\'ve|we|we\'re|we\'ve|our|my|us|anyone)\b/u', $quote)) {
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
        $value = str_replace(["\u{2019}", "\u{2018}"], "'", $value);
        $value = preg_replace('/[^\p{L}\p{N}\']+/u', ' ', $value) ?? $value;

        return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    }
}
