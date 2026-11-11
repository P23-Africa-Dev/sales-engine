<?php

namespace App\Services\Intent\DTO;

use App\Services\Discovery\DTO\IcpBrief;

/**
 * Short description of what a scan should hunt for. Built from the ICP's
 * own words, not from firmographic fields.
 *
 * The ICP is what the account is LOOKING FOR right now, never what it does. `mode` is
 * the kind of need: sell (they need customers), source (they need a product, service or
 * supplier), invest (they need deals), partner (they need partners), raise (they need
 * investors or funding). `target` names who or what they want to find; `offer` is the
 * thing being asked for or offered in the posts that fill that need.
 *
 * The expansion fields (synonyms, pain phrases, communities, exclusions)
 * come from the listening planner. They are what turn one vague offer into
 * the many short phrasings real buyers actually type.
 */
readonly class ListeningProfile
{
    public const MODES = ['sell', 'source', 'invest', 'partner', 'raise'];

    /**
     * @param  list<string>  $competitors
     * @param  list<string>  $territories
     * @param  list<string>  $synonyms  Category phrases buyers use for the offer.
     * @param  list<string>  $painPhrases  First-person problem phrasings the offer solves.
     * @param  list<string>  $communities  Subreddit names (no r/ prefix).
     * @param  list<string>  $excludeTerms  Words that mark a post as noise for this profile (hard text filter).
     * @param  list<string>  $avoid  The user's own ICP exclusions ("brokers", "consultants"). These describe
     *                               who is NOT a fit, so the qualifier judges them; they are not a text
     *                               filter, because "we're done with freight brokers" is a great lead.
     */
    public function __construct(
        public string $mode,
        public string $offer,
        public array $competitors,
        public bool $includeHiring,
        public array $territories,
        public array $synonyms = [],
        public array $painPhrases = [],
        public array $communities = [],
        public array $excludeTerms = [],
        public string $buyer = '',
        public array $avoid = [],
        public string $target = '',
    ) {}

    public static function fromBrief(IcpBrief $brief): self
    {
        $text = trim($brief->customPrompt.' '.$brief->description);
        $lower = mb_strtolower($text);

        $mode = self::modeFromNeed($lower);

        $includeHiring = (bool) preg_match('/\b(hiring|recruit|talent|appoint(?:ed|ment)?|leadership hire)/u', $lower);

        $offer = self::offerFrom($brief, $text);

        return new self(
            mode: $mode,
            offer: $offer,
            competitors: self::competitorsFrom($text),
            includeHiring: $includeHiring,
            territories: array_values(array_filter(array_map(
                static fn ($territory) => trim(explode(',', (string) $territory)[0] ?? ''),
                array_slice($brief->territories, 0, 3),
            ))),
            synonyms: array_values(array_filter(
                self::phraseList($brief->searchKeywords, 5, 4),
                static fn (string $keyword) => mb_strtolower($keyword) !== mb_strtolower($offer),
            )),
            avoid: self::phraseList($brief->exclusions, 10, 6),
            target: $offer,
        );
    }

    /**
     * What kind of need the ICP states. The ICP is what the account is looking for, so
     * "suppliers of cocoa" is a sourcing need and "investors for our agritech startup" is
     * a fundraising need — not a description of what the account sells.
     */
    public static function modeFromNeed(string $lower): string
    {
        if (preg_match('/\b(investors?|funding|grants?|accelerators?|capital|raise|raising)\b/u', $lower)
            && preg_match('/\b(need|needs|looking for|seeking|want|raise|raising|for (?:our|my))\b/u', $lower)
            && ! preg_match('/\b(invest in|investing in|deal flow|deal sourcing|portfolio compan)/u', $lower)) {
            return 'raise';
        }
        if (preg_match('/\b(invest(?:ing|ment)? (?:in|opportunit)|venture deals?|deal ?flow|deal sourcing|portfolio compan|startups? (?:raising|to invest))/u', $lower)) {
            return 'invest';
        }
        if (preg_match('/\b(partnerships?|partner with|partners? (?:for|to|in)|collaborat|distribution partners?|resellers?)/u', $lower)) {
            return 'partner';
        }
        if (preg_match('/\b(suppliers?|vendors?|manufacturers?|wholesalers?|providers? (?:of|for)|sourcing|to source|procure(?:ment)?|purchase|to buy|we need (?:a|an)|we\'re looking for (?:a|an))\b/u', $lower)) {
            return 'source';
        }

        return 'sell';
    }

    /**
     * @param  array{synonyms?: mixed, pain_phrases?: mixed, communities?: mixed, exclude_terms?: mixed, buyer?: mixed}  $expansion
     */
    public function withOverrides(?string $mode, ?string $offer, ?array $competitors, ?bool $includeHiring, array $expansion = []): self
    {
        $nextMode = in_array($mode, self::MODES, true) ? $mode : $this->mode;
        $nextOffer = trim((string) $offer);
        $nextOffer = $nextOffer !== '' ? self::clipWords($nextOffer, 5) : $this->offer;

        $nextCompetitors = $this->competitors;
        if (is_array($competitors)) {
            $cleaned = [];
            foreach ($competitors as $name) {
                $name = trim((string) $name);
                if ($name !== '' && mb_strlen($name) <= 40) {
                    $cleaned[] = $name;
                }
            }
            if ($cleaned !== []) {
                $nextCompetitors = array_values(array_unique($cleaned));
            }
        }

        return new self(
            mode: $nextMode,
            offer: $nextOffer,
            competitors: $nextCompetitors,
            includeHiring: $includeHiring === null ? $this->includeHiring : ($this->includeHiring || $includeHiring),
            territories: $this->territories,
            synonyms: self::phraseList($expansion['synonyms'] ?? null, 6, 4) ?: $this->synonyms,
            painPhrases: self::phraseList($expansion['pain_phrases'] ?? null, 6, 7) ?: $this->painPhrases,
            communities: self::communityList($expansion['communities'] ?? null) ?: $this->communities,
            excludeTerms: self::phraseList($expansion['exclude_terms'] ?? null, 10, 3) ?: $this->excludeTerms,
            buyer: self::clipWords(trim((string) ($expansion['buyer'] ?? '')), 20) ?: $this->buyer,
            avoid: $this->avoid,
            target: self::clipWords(trim((string) ($expansion['target'] ?? '')), 6) ?: ($nextOffer !== '' ? $nextOffer : $this->target),
        );
    }

    /**
     * True when the ICP names who the account wants (e.g. "fintech companies in Lagos")
     * rather than only a product, so that target's own moments count as openings.
     */
    public function hasDistinctTarget(): bool
    {
        $target = mb_strtolower(trim($this->target));

        return $target !== '' && $target !== mb_strtolower(trim($this->offer));
    }

    /**
     * The offer plus its synonyms, de-duplicated, offer first.
     *
     * @return list<string>
     */
    public function searchTerms(): array
    {
        $terms = [];
        foreach ([$this->offer, ...$this->synonyms] as $term) {
            $term = trim($term);
            if ($term !== '' && ! in_array(mb_strtolower($term), array_map('mb_strtolower', $terms), true)) {
                $terms[] = $term;
            }
        }

        return $terms;
    }

    /**
     * @return array<string, mixed>
     */
    public function toSummary(): array
    {
        return [
            'mode' => $this->mode,
            'target' => $this->target,
            'offer' => $this->offer,
            'competitors' => $this->competitors,
            'include_hiring' => $this->includeHiring,
            'synonyms' => $this->synonyms,
            'pain_phrases' => $this->painPhrases,
            'communities' => $this->communities,
            'exclude_terms' => $this->excludeTerms,
            'buyer' => $this->buyer,
            'avoid' => $this->avoid,
        ];
    }

    /**
     * @return list<string>
     */
    private static function phraseList(mixed $value, int $maxItems, int $maxWords): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $item) {
            $item = trim((string) preg_replace('/[\"()]+/u', ' ', (string) $item));
            $item = self::clipWords($item, $maxWords);
            if ($item === '' || mb_strlen($item) > 60) {
                continue;
            }
            if (! in_array(mb_strtolower($item), array_map('mb_strtolower', $out), true)) {
                $out[] = $item;
            }
            if (count($out) >= $maxItems) {
                break;
            }
        }

        return $out;
    }

    /**
     * @return list<string>
     */
    private static function communityList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $item) {
            $name = preg_replace('#^(?:https?://(?:www\.)?reddit\.com)?/?r/#i', '', trim((string) $item)) ?? '';
            $name = trim($name, '/ ');
            if (preg_match('/^[A-Za-z0-9_]{2,21}$/', $name) && ! in_array(mb_strtolower($name), array_map('mb_strtolower', $out), true)) {
                $out[] = $name;
            }
            if (count($out) >= 5) {
                break;
            }
        }

        return $out;
    }

    private static function offerFrom(IcpBrief $brief, string $text): string
    {
        $compressed = self::compress($text);
        if ($compressed !== '') {
            return $compressed;
        }

        foreach ($brief->searchKeywords as $keyword) {
            $keyword = self::clipWords(trim((string) $keyword), 5);
            if ($keyword !== '') {
                return $keyword;
            }
        }

        $industry = self::clipWords(trim((string) ($brief->industries[0] ?? '')), 5);
        if ($industry !== '') {
            return $industry;
        }

        return 'business software';
    }

    private static function compress(string $text): string
    {
        $stop = [
            'want', 'high', 'outside', 'home', 'market', 'markets', 'looking', 'that', 'this', 'with', 'from',
            'your', 'have', 'into', 'just', 'about', 'their', 'they', 'them', 'been', 'will', 'would', 'could',
            'should', 'opportunities', 'opportunity', 'conviction', 'need', 'needs', 'someone', 'something',
            'really', 'very', 'more', 'than', 'then', 'also', 'only', 'over', 'under', 'where', 'when', 'what',
            'which', 'while', 'because', 'across', 'using', 'used', 'based', 'good', 'some', 'such', 'other',
            'another', 'these', 'those', 'there', 'here', 'please', 'help', 'like', 'make', 'made', 'getting',
            'sell', 'selling', 'team', 'teams', 'small', 'people', 'person', 'company', 'companies',
        ];
        $modeWords = [
            'partnership', 'partnerships', 'partner', 'partners', 'investing', 'investment', 'investor',
            'investors', 'funding', 'hiring', 'recruit', 'recruiting', 'talent',
        ];

        $words = preg_split('/[^\p{L}\p{N}&]+/u', mb_strtolower($text)) ?: [];
        $kept = [];
        foreach ($words as $word) {
            if (mb_strlen($word) < 3 || in_array($word, $stop, true) || in_array($word, $modeWords, true)) {
                continue;
            }
            $kept[] = $word;
        }

        return self::clipWords(implode(' ', array_slice($kept, 0, 5)), 5);
    }

    /**
     * @return list<string>
     */
    private static function competitorsFrom(string $text): array
    {
        if ($text === '') {
            return [];
        }

        preg_match_all(
            '/\b(?:alternative to|switching from|switching off|frustrated with|instead of)\s+([A-Z][\w&.]+)/u',
            $text,
            $matches,
        );

        $names = [];
        foreach ($matches[1] ?? [] as $name) {
            $name = trim((string) $name);
            if ($name !== '') {
                $names[] = $name;
            }
        }

        return array_values(array_unique(array_slice($names, 0, 3)));
    }

    private static function clipWords(string $text, int $words): string
    {
        $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
        if ($text === '') {
            return '';
        }

        $parts = preg_split('/\s+/u', $text) ?: [];

        return implode(' ', array_slice($parts, 0, $words));
    }
}
