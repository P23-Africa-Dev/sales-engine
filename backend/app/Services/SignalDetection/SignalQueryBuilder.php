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
     * Event phrasings per signal type for news and job-board search. Unlike social posts,
     * company announcements are written in the third person ("X appoints Y as distributor in
     * Kenya"), so the query names the industry, the event and the territory.
     *
     * @var array<string, list<string>>
     */
    private const EVENT_PHRASES = [
        'new_market_entry' => ['{industry} opens subsidiary in {territory}', '{industry} expands into {territory} new office'],
        'distribution_partnership_announcement' => ['{industry} appoints distributor in {territory}', '{industry} partnership agreement {territory} distributor'],
        'leadership_hire_in_territory' => ['{industry} appoints country manager {territory}', '{industry} names managing director {territory}'],
        'export_trade_activity_mention' => ['{industry} begins exporting to {territory}', '{industry} first shipment {territory} export'],
        'hiring_job_post' => ['{industry} {territory} hiring', '{role} {industry} {territory}'],
        'trade_fair_exhibitor' => ['{industry} exhibitor trade fair {territory}', '{industry} expo {territory} exhibiting'],
        'local_plant_or_assembly' => ['{industry} opens plant in {territory}', '{industry} assembly plant {territory}'],
    ];

    private const MAX_EVENT_TERRITORIES = 2;

    /**
     * News / job-board queries for one signal type, built from the ICP's industry and
     * territories (where the event must happen).
     *
     * @return list<string>
     */
    public function buildEventQueries(SignalTypeDefinition $type, IcpBrief $brief): array
    {
        $industry = $this->industryTerm($brief);
        $territories = array_slice(array_values(array_filter(array_map(
            static fn ($t): string => trim((string) $t),
            $brief->territories,
        ))), 0, self::MAX_EVENT_TERRITORIES);
        if ($territories === []) {
            $place = $this->placeHint($type);
            $territories = [$place];
        }
        $role = trim((string) ($brief->decisionMakers[0] ?? ''));

        // An organisation's own phrasings for this type win; then the built-in ones.
        $custom = array_values(array_filter((array) ($type->search_phrases ?? []), static fn ($p): bool => is_string($p) && trim($p) !== ''));
        $phrases = $custom !== [] ? $custom : (self::EVENT_PHRASES[$type->key] ?? ['{industry} '.$type->label.' {territory}']);
        $queries = [];
        foreach ($territories as $index => $territory) {
            // Every territory gets the main phrasing; the first one also gets the variant.
            foreach ($index === 0 ? $phrases : [$phrases[0]] as $phrase) {
                $query = strtr($phrase, ['{industry}' => $industry, '{territory}' => $territory, '{role}' => $role]);
                $query = trim((string) preg_replace('/\s+/u', ' ', $query));
                if (str_word_count($query) >= 2) {
                    $queries[] = $query;
                }
            }
        }

        // Where the companies are based, when the ICP says ("German manufacturer opens subsidiary
        // in Kenya"): one extra phrasing per type, for the first location and territory.
        $location = trim((string) ($brief->companyLocations[0] ?? ''));
        if ($location !== '') {
            $query = strtr($phrases[0], ['{industry}' => trim($location.' '.$industry), '{territory}' => $territories[0], '{role}' => $role]);
            $queries[] = trim((string) preg_replace('/\s+/u', ' ', $query));
        }

        return array_values(array_unique($queries));
    }

    /**
     * Home-market phrasings per language: a German or Dutch exporter's move into Kenya is
     * reported first in its own trade press, in its own language. Industry stays generic
     * ("Hersteller"); the extractor and ICP check decide the industry.
     *
     * @var array<string, array<string, list<string>>>
     */
    private const LOCAL_PHRASES = [
        'de' => [
            'new_market_entry' => ['Hersteller gründet Tochtergesellschaft in {territory}', 'eröffnet Niederlassung in {territory}'],
            'distribution_partnership_announcement' => ['neuer Vertriebspartner in {territory}', 'Distributor für {territory} ernannt'],
            'leadership_hire_in_territory' => ['Geschäftsführer {territory} ernannt'],
            'export_trade_activity_mention' => ['Exporte nach {territory} Auftrag'],
            'trade_fair_exhibitor' => ['Aussteller Messe {territory}'],
            'local_plant_or_assembly' => ['Werk in {territory} eröffnet'],
        ],
        'nl' => [
            'new_market_entry' => ['opent vestiging in {territory}', 'dochteronderneming in {territory}'],
            'distribution_partnership_announcement' => ['nieuwe distributeur in {territory}'],
            'leadership_hire_in_territory' => ['benoemd tot directeur {territory}'],
            'export_trade_activity_mention' => ['export naar {territory} order'],
            'trade_fair_exhibitor' => ['exposant beurs {territory}'],
            'local_plant_or_assembly' => ['fabriek in {territory} geopend'],
        ],
        'fr' => [
            'new_market_entry' => ['ouvre une filiale en {territory}', 'implantation en {territory}'],
            'distribution_partnership_announcement' => ['nouveau distributeur en {territory}'],
            'leadership_hire_in_territory' => ['nommé directeur général {territory}'],
            'export_trade_activity_mention' => ['exportations vers {territory}'],
            'trade_fair_exhibitor' => ['exposant salon {territory}'],
            'local_plant_or_assembly' => ['usine en {territory} inaugurée'],
        ],
    ];

    /** Country (as typed in the ICP) → search language and Serper country code. */
    private const LOCATION_LANGUAGE = [
        'germany' => ['de', 'de'], 'deutschland' => ['de', 'de'], 'austria' => ['de', 'at'], 'switzerland' => ['de', 'ch'],
        'netherlands' => ['nl', 'nl'], 'holland' => ['nl', 'nl'], 'belgium' => ['nl', 'be'],
        'france' => ['fr', 'fr'],
    ];

    /** Territory names as the local press writes them. */
    private const TERRITORY_NAMES = [
        'de' => ['africa' => 'Afrika', 'kenya' => 'Kenia', 'south africa' => 'Südafrika', 'egypt' => 'Ägypten', 'morocco' => 'Marokko', 'ethiopia' => 'Äthiopien', 'tanzania' => 'Tansania', 'east africa' => 'Ostafrika', 'west africa' => 'Westafrika'],
        'nl' => ['africa' => 'Afrika', 'kenya' => 'Kenia', 'south africa' => 'Zuid-Afrika', 'egypt' => 'Egypte', 'morocco' => 'Marokko', 'ethiopia' => 'Ethiopië', 'east africa' => 'Oost-Afrika', 'west africa' => 'West-Afrika'],
        'fr' => ['africa' => 'Afrique', 'south africa' => 'Afrique du Sud', 'egypt' => 'Égypte', 'morocco' => 'Maroc', 'ethiopia' => 'Éthiopie', 'tanzania' => 'Tanzanie', 'east africa' => "Afrique de l'Est", 'west africa' => "Afrique de l'Ouest"],
    ];

    /**
     * News queries in the home-market language of where the companies are based (phase 3's
     * "based in"), with the country and language to search in.
     *
     * @return list<array{q: string, gl: string, hl: string}>
     */
    public function buildLocalizedEventQueries(SignalTypeDefinition $type, IcpBrief $brief): array
    {
        $territories = array_slice(array_values(array_filter(array_map(
            static fn ($t): string => trim((string) $t),
            $brief->territories,
        ))), 0, self::MAX_EVENT_TERRITORIES);
        if ($territories === []) {
            return [];
        }

        $queries = [];
        $seenLanguages = [];
        foreach ($brief->companyLocations as $location) {
            [$language, $country] = self::LOCATION_LANGUAGE[mb_strtolower(trim((string) $location))] ?? [null, null];
            if ($language === null || isset($seenLanguages[$language]) || ! isset(self::LOCAL_PHRASES[$language][$type->key])) {
                continue;
            }
            $seenLanguages[$language] = true;
            foreach (self::LOCAL_PHRASES[$language][$type->key] as $index => $phrase) {
                // Main phrasing for each territory; the variant only for the first.
                foreach ($index === 0 ? $territories : [$territories[0]] as $territory) {
                    $localName = self::TERRITORY_NAMES[$language][mb_strtolower($territory)] ?? $territory;
                    $queries[] = ['q' => strtr($phrase, ['{territory}' => $localName]), 'gl' => $country, 'hl' => $language];
                }
            }
        }

        return $queries;
    }

    /**
     * The industry as a search term: the first ICP industry, else the first search keyword.
     */
    private function industryTerm(IcpBrief $brief): string
    {
        foreach ([$brief->industries, $brief->searchKeywords] as $list) {
            foreach ($list as $value) {
                $value = trim((string) $value);
                if ($value !== '' && ! str_contains($value, 'site:')) {
                    return $value;
                }
            }
        }

        return '';
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
