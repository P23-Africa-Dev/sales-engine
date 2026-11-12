<?php

namespace App\Services\SignalDetection;

use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;

/**
 * Turns a listening profile into short, intent-shaped search queries.
 *
 * Long OR-chains glued to a five-word offer return almost nothing from a
 * search engine, so queries here are short and come in families, the way
 * Awario Leads and Brandwatch structure social-selling searches:
 *
 *   - ask:        someone asking for a recommendation for the offer
 *   - evaluate:   someone comparing, looking for, or replacing a tool
 *   - competitor: someone unhappy with, or leaving, a named competitor
 *   - pain:       someone describing the problem in their own words
 *   - community:  the offer inside a subreddit where these buyers gather
 *
 * Families are interleaved so a budget-capped run samples every family, and
 * the orchestrator rotates the start offset between runs so scheduled scans
 * cover the whole plan over time instead of repeating the first few queries.
 */
class IcpOpportunityQueryBuilder
{
    private const MAX_QUERIES = 24;

    private const SELL_NOISE = '-jobs -vacancy -internship -course';

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
        return array_values(array_map(
            static fn (array $planned) => $planned['query'],
            $this->plan($profile),
        ));
    }

    /**
     * @return list<array{query: string, native: string, family: string, only_sources: ?list<string>}>
     */
    public function plan(ListeningProfile $profile): array
    {
        $terms = array_slice($profile->searchTerms(), 0, 4);
        if ($terms === []) {
            $terms = ['business software'];
        }
        $place = $this->place($profile->territories);

        $lanes = match ($profile->mode) {
            'invest' => $this->investLanes($terms, $place),
            'partner' => $this->partnerLanes($terms, $place),
            'source' => $this->sourceLanes($profile, $terms, $place),
            'raise' => $this->raiseLanes($this->sectorTerms($profile) ?: $terms, $place),
            default => [...$this->sellLanes($profile, $terms, $place), $this->targetMomentLane($profile, $place)],
        };
        // The planner writes how the other side of this need actually posts ("we supply bulk
        // cocoa beans", "now accepting pitches for agritech"). Searched as exact phrases, these
        // find openings instead of commentary, so they lead every plan.
        $lanes = [$this->needPhraseLane($profile), ...array_values(array_filter(
            $lanes,
            static fn (array $lane): bool => ! ($lane !== [] && ($lane[0]['family'] ?? null) === 'pain'),
        ))];

        if ($profile->includeHiring) {
            $lanes[] = [$this->entry("appointed OR hiring {$this->phrase($terms[0])} {$place}", 'hiring')];
        }

        $planned = $this->interleave($lanes);
        $planned = $this->appendExclusions($planned, $profile);

        $seen = [];
        $unique = [];
        foreach ($planned as $entry) {
            $key = mb_strtolower($entry['query']);
            if ($entry['query'] === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $unique[] = $entry;
        }

        return array_slice($unique, 0, self::MAX_QUERIES);
    }

    /**
     * @param  list<string>  $terms
     * @return list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>
     */
    private function sellLanes(ListeningProfile $profile, array $terms, string $place): array
    {
        $ask = [];
        $evaluate = [];
        foreach ($terms as $index => $term) {
            $phrase = $this->phrase($term);
            $ask[] = $this->entry("(\"recommend\" OR \"recommendations\" OR \"suggestions\") {$phrase}", 'ask');
            $evaluate[] = $this->entry("(\"looking for\" OR \"alternative to\" OR \"anyone using\") {$phrase}", 'evaluate');
            if ($index === 0 && $place !== '') {
                $ask[] = $this->entry("(\"recommend\" OR \"looking for\") {$phrase} {$place}", 'ask');
            }
        }

        $competitor = [];
        foreach (array_slice($profile->competitors, 0, 4) as $name) {
            $name = trim(str_replace('"', '', $name));
            if ($name === '') {
                continue;
            }
            $competitor[] = $this->entry(
                "(\"frustrated with {$name}\" OR \"switching from {$name}\" OR \"alternative to {$name}\")",
                'competitor',
            );
            $competitor[] = $this->entry("\"{$name}\" (expensive OR cancel OR terrible OR \"moving away\")", 'competitor');
        }

        $pain = [];
        foreach (array_slice($profile->painPhrases, 0, 5) as $phrase) {
            $pain[] = $this->entry($phrase, 'pain');
        }

        $community = [];
        foreach (array_slice($profile->communities, 0, 4) as $index => $subreddit) {
            $term = $this->phrase($terms[$index % count($terms)]);
            $community[] = [
                'query' => "site:reddit.com/r/{$subreddit} (\"recommend\" OR \"looking for\" OR \"anyone\") {$term}",
                'native' => "subreddit:{$subreddit} {$term}",
                'family' => 'community',
                'only_sources' => ['reddit', 'reddit_native'],
            ];
        }

        return [$ask, $evaluate, $competitor, $pain, $community];
    }

    /**
     * @param  list<string>  $terms
     * @return list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>
     */
    private function investLanes(array $terms, string $place): array
    {
        $raising = [];
        $seeking = [];
        foreach ($terms as $index => $term) {
            $phrase = $this->phrase($term);
            $raising[] = $this->entry(trim("(raising OR \"seed round\" OR \"series A\" OR \"pre-seed\") {$phrase}".($index === 0 ? " {$place}" : '')), 'funding');
            $seeking[] = $this->entry("(\"looking for investors\" OR \"we're raising\" OR \"just raised\") {$phrase}", 'funding');
        }

        return [$raising, $seeking];
    }

    /**
     * @return list<array{query: string, native: string, family: string, only_sources: ?list<string>}>
     */
    private function needPhraseLane(ListeningProfile $profile): array
    {
        $lane = [];
        foreach (array_slice($profile->painPhrases, 0, 5) as $phrase) {
            $phrase = trim(str_replace('"', '', $phrase));
            if ($phrase !== '') {
                $lane[] = $this->entry('"'.$phrase.'"', 'pain');
            }
        }

        return $lane;
    }

    /**
     * Customers mode: the target companies/people themselves at a moment of need —
     * expanding, launching, raising, seeking providers. Only when the target differs
     * from the offer (the ICP names who they want, not just a product).
     *
     * @return list<array{query: string, native: string, family: string, only_sources: ?list<string>}>
     */
    private function targetMomentLane(ListeningProfile $profile, string $place): array
    {
        $target = trim($profile->target);
        if (! $profile->hasDistinctTarget()) {
            return [];
        }
        $phrase = $this->phrase($target);

        return [
            $this->entry(trim("{$phrase} (\"looking for\" OR seeking OR \"need a\" OR tender OR RFP) {$place}"), 'moment'),
            $this->entry(trim("{$phrase} (expanding OR launch OR launched OR \"new office\" OR raised) {$place}"), 'moment'),
        ];
    }

    /**
     * Source mode: the account NEEDS this product/service, so suppliers offering it and
     * people recommending providers are the openings.
     *
     * @param  list<string>  $terms
     * @return list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>
     */
    private function sourceLanes(ListeningProfile $profile, array $terms, string $place): array
    {
        $offering = [];
        $recommended = [];
        foreach ($terms as $index => $term) {
            $phrase = $this->phrase($term);
            $offering[] = $this->entry(trim("{$phrase} (supplier OR suppliers OR \"we supply\" OR \"we offer\" OR distributor OR manufacturer OR wholesale)".($index === 0 ? " {$place}" : '')), 'supply');
            $recommended[] = $this->entry(trim("(\"recommend\" OR \"reliable\" OR \"best\") {$phrase} (supplier OR provider OR vendor)".($index === 0 ? " {$place}" : '')), 'supply');
        }

        $pain = [];
        foreach (array_slice($profile->painPhrases, 0, 3) as $phrase) {
            $pain[] = $this->entry($phrase, 'supply');
        }

        return [$offering, $recommended, $pain];
    }

    /**
     * The sector a funding need is about ("agritech"), without the funding vocabulary itself.
     * "venture capital" or "startup funding" as a search term matches every investor post
     * online; the sector is what makes an investor relevant to this startup.
     *
     * @return list<string>
     */
    private function sectorTerms(ListeningProfile $profile): array
    {
        $funding = '/\b(funding|funds?|fundraising|investors?|investment|investing|venture capital|vc|vcs|capital|grants?|accelerators?|seed|series [a-e]|startup|startups|impact|pitch(es)?)\b/iu';
        $terms = [];
        foreach ([$profile->offer, $profile->target, ...$profile->synonyms] as $term) {
            $sector = trim(preg_replace('/\s+/u', ' ', preg_replace($funding, ' ', (string) $term) ?? '') ?? '');
            $sector = trim(preg_replace('/\b(for|in|of|and|the|our|my)\b/iu', ' ', $sector) ?? $sector);
            $sector = trim(preg_replace('/\s+/u', ' ', $sector) ?? $sector);
            if ($sector !== '' && mb_strlen($sector) >= 3 && ! in_array(mb_strtolower($sector), array_map('mb_strtolower', $terms), true)) {
                $terms[] = $sector;
            }
        }

        return array_slice($terms, 0, 3);
    }

    /**
     * Raise mode: the account needs investors, so funds, investors, grants and
     * accelerators open to its sector are the openings.
     *
     * @param  list<string>  $terms
     * @return list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>
     */
    private function raiseLanes(array $terms, string $place): array
    {
        $investors = [];
        $programs = [];
        foreach ($terms as $index => $term) {
            $phrase = $this->phrase($term);
            $investors[] = $this->entry(trim("(\"we invest in\" OR \"now investing\" OR \"new fund\" OR \"pitch us\" OR \"looking to invest\") {$phrase}".($index === 0 ? " {$place}" : '')), 'funding');
            $programs[] = $this->entry(trim("(\"call for applications\" OR accelerator OR grant OR \"applications open\") {$phrase}".($index === 0 ? " {$place}" : '')), 'funding');
        }

        return [$investors, $programs];
    }

    /**
     * @param  list<string>  $terms
     * @return list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>
     */
    private function partnerLanes(array $terms, string $place): array
    {
        $seeking = [];
        $open = [];
        foreach ($terms as $index => $term) {
            $phrase = $this->phrase($term);
            $seeking[] = $this->entry(trim("\"looking for\" partner OR partnership {$phrase}".($index === 0 ? " {$place}" : '')), 'partnership');
            $open[] = $this->entry("(\"seeking partners\" OR \"open to partnerships\" OR distributor OR reseller) {$phrase}", 'partnership');
        }

        return [$seeking, $open];
    }

    /**
     * @param  list<list<array{query: string, native: string, family: string, only_sources: ?list<string>}>>  $lanes
     * @return list<array{query: string, native: string, family: string, only_sources: ?list<string>}>
     */
    private function interleave(array $lanes): array
    {
        $out = [];
        $depth = max(array_map('count', $lanes) ?: [0]);
        for ($i = 0; $i < $depth; $i++) {
            foreach ($lanes as $lane) {
                if (isset($lane[$i])) {
                    $out[] = $lane[$i];
                }
            }
        }

        return $out;
    }

    /**
     * Search-engine queries get job/course noise removed plus up to three of
     * the plan's own single-word exclusions. Native API queries stay plain.
     *
     * @param  list<array{query: string, native: string, family: string, only_sources: ?list<string>}>  $planned
     * @return list<array{query: string, native: string, family: string, only_sources: ?list<string>}>
     */
    private function appendExclusions(array $planned, ListeningProfile $profile): array
    {
        $extra = [];
        foreach ($profile->excludeTerms as $term) {
            if (preg_match('/^[\p{L}\p{N}]{3,20}$/u', $term) && ! in_array(mb_strtolower($term), ['jobs', 'vacancy', 'internship', 'course'], true)) {
                $extra[] = '-'.mb_strtolower($term);
            }
            if (count($extra) >= 3) {
                break;
            }
        }

        return array_map(function (array $entry) use ($profile, $extra): array {
            if (! in_array($profile->mode, ['sell', 'source'], true) || $entry['family'] === 'hiring') {
                return $entry;
            }
            $entry['query'] = $this->clip(trim($entry['query'].' '.self::SELL_NOISE.' '.implode(' ', $extra)), 28);

            return $entry;
        }, $planned);
    }

    /**
     * @return array{query: string, native: string, family: string, only_sources: ?list<string>}
     */
    private function entry(string $query, string $family): array
    {
        $query = $this->clip(trim($query));

        return [
            'query' => $query,
            'native' => $query,
            'family' => $family,
            'only_sources' => null,
        ];
    }

    /**
     * Quote short multi-word terms so the engine keeps them together.
     */
    private function phrase(string $term): string
    {
        $term = trim(str_replace('"', '', $term));
        $words = preg_split('/\s+/u', $term) ?: [];

        return count($words) >= 2 && count($words) <= 3 ? "\"{$term}\"" : $term;
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

    private function clip(string $text, int $words = 22): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
        $parts = preg_split('/\s+/u', $text) ?: [];

        return implode(' ', array_slice($parts, 0, $words));
    }
}
