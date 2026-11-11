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

    /** Roles dropped even for a confirmed signal-type event: job ads and noise. */
    private const NON_EVENT_ROLES = ['recruiter', 'spam', 'bot'];

    /**
     * @param  array<string, mixed>  $enriched
     * @param  bool  $confirmedSignalType  The signal extractor already matched this post
     *                                     to one of the ICP's enabled signal types (new market entry, leadership
     *                                     hire, ...). Those are company events, usually reported by news or the
     *                                     company itself, so the buyer-opening checks below do not apply.
     */
    public function rejection(array $enriched, string $text, ListeningProfile $profile, bool $confirmedSignalType = false): ?string
    {
        if (($enriched['from_heuristic'] ?? false) === true) {
            return 'not_an_opportunity';
        }

        if ($confirmedSignalType) {
            $role = mb_strtolower(trim((string) ($enriched['author_role'] ?? '')));

            return in_array($role, self::NON_EVENT_ROLES, true) ? 'not_a_buyer' : null;
        }

        if (($enriched['actionability'] ?? '') !== 'reply_now') {
            return 'not_an_opportunity';
        }

        $role = mb_strtolower(trim((string) ($enriched['author_role'] ?? '')));
        $type = mb_strtolower(trim((string) ($enriched['signal_type'] ?? 'other')));

        // When the account needs a product or supplier, the vendor posting it IS the opening.
        $vendorIsOpening = $profile->mode === 'source' && in_array($role, ['vendor', 'self_promotion'], true);
        if (! $vendorIsOpening && in_array($role, self::NON_BUYER_ROLES, true)) {
            return 'not_a_buyer';
        }
        // News about a target customer expanding or raising is a moment; news alone is not an ask.
        if (in_array($role, ['news', 'media'], true) && $profile->mode === 'sell'
            && ! ($profile->hasDistinctTarget() && in_array($type, ['market_signal', 'funding_event', 'partnership_opportunity'], true))) {
            return 'not_a_buyer';
        }

        if (in_array($type, ['', 'other', 'regulatory_change'], true)) {
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
            'invest', 'raise' => in_array($type, ['funding_event', 'investment_opportunity'], true),
            'partner' => $type === 'partnership_opportunity',
            'source' => in_array($type, ['recommendation', 'pricing', 'market_signal', 'partnership_opportunity', 'competitive_move'], true),
            // Customers: asks and switches; the target's own moments (expansion, raise, partnering)
            // count only when the ICP names target companies, not just a product.
            default => in_array($type, ['recommendation', 'switching', 'pricing', 'competitive_move'], true)
                || ($profile->hasDistinctTarget() && in_array($type, ['market_signal', 'funding_event', 'partnership_opportunity'], true)),
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

        // Sourcing: a provider describing itself in the need's own terms ("a mobile app development
        // company building fintech applications") is the evidence — no "we offer" phrase required.
        if ($profile->mode === 'source' && $this->prefilter->mentionsPlanTerm($quote, $profile)) {
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
