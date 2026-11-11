<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;

/**
 * Cheap reject pass before a model call. Drops what is never an opening:
 * job ads, listicles, vendor self-promotion, the plan's noise words, and
 * snippets too short to prove anything.
 *
 * It deliberately does NOT require ask-words like "recommend". A buyer who
 * writes "our drivers keep faking fuel receipts, it's killing margins" is the
 * best lead in the feed and contains none of them; judging intent is the
 * qualifier model's job. Here a post only has to be on-topic: it carries an
 * intent cue or one of the plan's own terms.
 */
class OpportunityPrefilter
{
    public const SELL_CUES = '/\b(recommend(?:ation|ations|ed)?|suggestions?|looking for|anyone (?:use|using|know|tried|recommend)|what (?:do you|are you|does everyone) us(?:e|ing)|alternative(?:s)? to|switch(?:ing)?(?: from| off| away)?|moving (?:away )?from|frustrated with|fed up with|tired of|struggling (?:with|to)|need (?:a|an|help|advice)|any (?:advice|tips|suggestions)|what(?:\'s| is) the best|which (?:tool|software|app|platform|provider|company|vendor|service)|how do (?:you|i|we) (?:manage|handle|track|deal with)|too expensive|how much|pricing|quote for)\b/iu';

    public const INVEST_CUES = '/\b(rais(?:e|es|ed|ing)|seed round|series\s+[a-e]\b|funding round|pre-seed|invest(?:or|ors|ment)?)\b/iu';

    public const PARTNER_CUES = '/\b(looking for(?:\s+\w+){0,4}\s+partners?|seeking(?:\s+\w+){0,4}\s+partners?|partnership|collaborat(?:e|ion|ing)|distributors?|resellers?)\b/iu';

    /** Source mode: someone offering or recommending what the account needs. */
    public const SOURCE_CUES = '/\b(suppl(?:y|ier|iers|ying)|we offer|we provide|available|wholesale|distributor|manufacturer|in stock|price list|recommend(?:ed|ation)?|reliable|vendor|provider)\b/iu';

    /** Raise mode: investors, funds, grants and programmes open to deals. */
    public const RAISE_CUES = '/\b(we invest|now investing|looking to invest|new fund|fund (?:ii|iii|iv|\d)|pitch|applications? (?:open|now open)|call for applications|accelerator|grant|cheque|check size)\b/iu';

    /** Customers mode: the target itself at a moment that opens a conversation. */
    public const MOMENT_CUES = '/\b(expand(?:ing|s|ed)?|launch(?:es|ed|ing)?|new office|now open|raised|seeking|tender|rfp|request for proposals?)\b/iu';

    public const HIRING_CUES = '/\b(appointed|appoints|hiring|we.?re hiring|joining as|named as)\b/iu';

    public const JOB_BLOCK = '/\b(we.?re hiring|now hiring|job opening|job openings|vacancy|vacancies|apply now|headcount|send (?:your )?cv|job description)\b/iu';

    public const LISTICLE_BLOCK = '/\b(top\s+\d+|\d+\s+best|best\s+\d+|best tools|ultimate guide)\b/iu';

    /** A vendor talking about its own product is not a buyer. */
    public const PROMO_BLOCK = '/\b(dm (?:me|us) (?:for|to)|book a (?:free )?demo|sign up (?:now|today|free)|start (?:your )?free trial|use (?:my |our )?code|link in (?:bio|comments)|limited (?:time )?offer|we help (?:companies|businesses|brands|teams|startups)|our (?:platform|solution|software|tool) (?:helps|lets|allows))\b/iu';

    public function accepts(RawSocialHit $hit, ListeningProfile $profile): bool
    {
        return $this->rejection($hit, $profile) === null;
    }

    /**
     * @param  bool  $requireTopicCue  False for hits from a signal-type query: a
     *                                 company event ("opens a Nairobi office") carries no buyer cue,
     *                                 and the signal extractor judges whether it matches the type.
     */
    public function rejection(RawSocialHit $hit, ListeningProfile $profile, bool $requireTopicCue = true): ?string
    {
        $url = mb_strtolower((string) $hit->postUrl);
        if (str_contains($url, '/jobs') || str_contains($url, '/careers')) {
            return 'not_an_opportunity';
        }

        $text = trim($hit->postText.' '.$hit->title);
        if ($text === '') {
            return 'not_an_opportunity';
        }

        if (preg_match(self::LISTICLE_BLOCK, $text)) {
            return 'not_an_opportunity';
        }

        if (! $profile->includeHiring && preg_match(self::JOB_BLOCK, $text)) {
            return 'not_an_opportunity';
        }

        if ($profile->mode === 'sell' && preg_match(self::PROMO_BLOCK, $text)) {
            return 'self_promotion';
        }

        if ($this->hasExcludedTerm($text, $profile)) {
            return 'excluded_term';
        }

        $length = mb_strlen(trim($hit->postText));
        $floor = $hit->fullText ? 40 : 60;
        if ($length < $floor) {
            return 'not_an_opportunity';
        }

        if ($requireTopicCue && ! $this->hasCue($text, $profile) && ! $this->mentionsPlanTerm($text, $profile)) {
            return 'not_an_opportunity';
        }

        return null;
    }

    public function hasCue(string $text, ListeningProfile $profile): bool
    {
        $pattern = match ($profile->mode) {
            'invest' => self::INVEST_CUES,
            'partner' => self::PARTNER_CUES,
            'source' => self::SOURCE_CUES,
            'raise' => self::RAISE_CUES,
            default => self::SELL_CUES,
        };

        if (preg_match($pattern, $text)) {
            return true;
        }

        if ($profile->mode === 'sell' && $profile->hasDistinctTarget() && preg_match(self::MOMENT_CUES, $text)) {
            return true;
        }

        return $profile->includeHiring && preg_match(self::HIRING_CUES, $text) === 1;
    }

    /**
     * True when the text mentions the offer, a synonym, a competitor, or a
     * distinctive word from a pain phrase.
     */
    public function mentionsPlanTerm(string $text, ListeningProfile $profile): bool
    {
        $haystack = mb_strtolower($text);
        foreach ([...$profile->searchTerms(), ...$profile->competitors] as $term) {
            $term = mb_strtolower(trim($term));
            if ($term !== '' && mb_strlen($term) >= 3 && str_contains($haystack, $term)) {
                return true;
            }

            // Multi-word offers rarely appear verbatim ("gps fleet tracking
            // haulage"); two of their distinctive words is enough to be on topic.
            $words = array_values(array_filter(
                preg_split('/[^\p{L}\p{N}]+/u', $term) ?: [],
                static fn ($word) => mb_strlen((string) $word) >= 4,
            ));
            if (count($words) >= 2) {
                $found = 0;
                foreach ($words as $word) {
                    if (preg_match('/\b'.preg_quote($word, '/').'/u', $haystack)) {
                        $found++;
                    }
                }
                if ($found >= 2) {
                    return true;
                }
            }
        }

        foreach ($profile->painPhrases as $phrase) {
            $words = array_filter(
                preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($phrase)) ?: [],
                static fn ($word) => mb_strlen((string) $word) >= 5,
            );
            $hits = 0;
            foreach ($words as $word) {
                if (str_contains($haystack, $word)) {
                    $hits++;
                }
            }
            if ($hits >= 2) {
                return true;
            }
        }

        return false;
    }

    private function hasExcludedTerm(string $text, ListeningProfile $profile): bool
    {
        foreach ($profile->excludeTerms as $term) {
            $term = trim($term);
            if ($term === '') {
                continue;
            }
            if (preg_match('/\b'.preg_quote($term, '/').'\b/iu', $text)) {
                return true;
            }
        }

        return false;
    }
}
