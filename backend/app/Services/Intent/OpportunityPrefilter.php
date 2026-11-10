<?php

namespace App\Services\Intent;

use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Intent\DTO\RawSocialHit;

/**
 * Cheap reject pass before a model call. Keeps posts that read like an ask
 * and drops jobs, listicles, and snippets too short to prove anything.
 */
class OpportunityPrefilter
{
    public const SELL_CUES = '/\b(recommend(?:ation|ations)?|looking for|anyone (?:use|using|know)|what (?:do you|are you) us(?:e|ing)|alternative to|switch(?:ing)?(?: from| off)?|frustrated with|how much|pricing)\b/iu';

    public const INVEST_CUES = '/\b(rais(?:e|es|ed|ing)|seed round|series\s+[a-e]\b|funding round|pre-seed|invest(?:or|ors|ment)?)\b/iu';

    public const PARTNER_CUES = '/\b(looking for(?:\s+\w+){0,4}\s+partners?|seeking(?:\s+\w+){0,4}\s+partners?|partnership|collaborat(?:e|ion|ing))\b/iu';

    public const HIRING_CUES = '/\b(appointed|appoints|hiring|we.?re hiring|joining as|named as)\b/iu';

    public const JOB_BLOCK = '/\b(we.?re hiring|now hiring|job opening|job openings|vacancy|vacancies|apply now|headcount)\b/iu';

    public const LISTICLE_BLOCK = '/\b(top\s+\d+|\d+\s+best|best\s+\d+|best tools|ultimate guide)\b/iu';

    public function accepts(RawSocialHit $hit, ListeningProfile $profile): bool
    {
        return $this->rejection($hit, $profile) === null;
    }

    public function rejection(RawSocialHit $hit, ListeningProfile $profile): ?string
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

        $length = mb_strlen(trim($hit->postText));
        $floor = $hit->fullText ? 40 : 80;
        if ($length < $floor) {
            return 'not_an_opportunity';
        }

        if (! $this->hasCue($text, $profile)) {
            return 'not_an_opportunity';
        }

        return null;
    }

    public function hasCue(string $text, ListeningProfile $profile): bool
    {
        $pattern = match ($profile->mode) {
            'invest' => self::INVEST_CUES,
            'partner' => self::PARTNER_CUES,
            default => self::SELL_CUES,
        };

        if (preg_match($pattern, $text)) {
            return true;
        }

        return $profile->includeHiring && preg_match(self::HIRING_CUES, $text) === 1;
    }
}
