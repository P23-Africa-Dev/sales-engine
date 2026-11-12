<?php

namespace App\Services\SignalDetection;

use App\Models\JobPostingWatch;
use App\Models\Organization;
use App\Models\SignalTypeDefinition;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Llm\GlmClient;
use App\Services\SignalDetection\DTO\DetectedSignal;
use Carbon\Carbon;

/**
 * Per-type Stage 2 extraction. A hit that fails the type's trigger / invalid
 * example is rejected — not forced into a nearby bucket.
 */
class SignalExtractor
{
    public function __construct(
        private readonly GlmClient $glm = new GlmClient,
    ) {}

    public function extract(
        RawSocialHit $hit,
        SignalTypeDefinition $type,
        Organization $organization,
        ?IcpBrief $brief = null,
    ): DetectedSignal {
        if ($this->glm->isConfigured()) {
            try {
                $detected = $this->extractWithLlm($hit, $type, $organization, $brief);
            } catch (\Throwable) {
                $detected = $this->extractHeuristic($hit, $type);
            }
        } else {
            $detected = $this->extractHeuristic($hit, $type);
        }

        return $this->applyPostGates($detected, $hit, $type, $organization, $brief);
    }

    /**
     * Several posts at once: one concurrent batch of model calls instead of one call per post.
     * A post whose call fails falls back to the heuristic, like extract().
     *
     * @param  list<array{hit: RawSocialHit, type: SignalTypeDefinition}>  $items
     * @return list<DetectedSignal> Same order as $items.
     */
    public function extractMany(array $items, Organization $organization, ?IcpBrief $brief = null): array
    {
        $results = [];
        if ($items !== [] && $this->glm->isConfigured()) {
            $requests = [];
            foreach ($items as $index => $item) {
                $requests[$index] = ['messages' => $this->llmMessages($item['hit'], $item['type'], $organization, $brief)];
            }
            try {
                $responses = $this->glm->chatJsonPool($requests, 'extract', $organization);
            } catch (\Throwable) {
                $responses = [];
            }
            foreach ($items as $index => $item) {
                $json = $responses[$index] ?? null;
                $results[$index] = is_array($json)
                    ? $this->fromLlmJson($json, $item['hit'], $item['type'])
                    : $this->extractHeuristic($item['hit'], $item['type']);
            }
        } else {
            foreach ($items as $index => $item) {
                $results[$index] = $this->extractHeuristic($item['hit'], $item['type']);
            }
        }

        $out = [];
        foreach ($items as $index => $item) {
            $out[] = $this->applyPostGates($results[$index], $item['hit'], $item['type'], $organization, $brief);
        }

        return $out;
    }

    private function extractWithLlm(
        RawSocialHit $hit,
        SignalTypeDefinition $type,
        Organization $organization,
        ?IcpBrief $brief,
    ): DetectedSignal {
        $json = $this->glm->chatJson($this->llmMessages($hit, $type, $organization, $brief), 'extract', $organization);

        return $this->fromLlmJson($json, $hit, $type);
    }

    /**
     * @return list<array{role: string, content: string}>
     */
    private function llmMessages(RawSocialHit $hit, SignalTypeDefinition $type, Organization $organization, ?IcpBrief $brief): array
    {
        $watch = $type->key === 'open_developer_roles_unfilled'
            ? $this->touchJobPostingWatch($organization, $hit)
            : null;

        return [
            [
                'role' => 'system',
                'content' => 'Decide whether a post is a genuine match for ONE discrete buyer-signal type. '
                    .'Do not force a fit. If it is a performance story, listicle, vague commentary, or a different event, set matched=false. '
                    .'For export_trade_activity_mention, matched=true only when the trade direction is into the ICP territories (or unspecified). Reject exports from ICP territories into unrelated markets. '
                    .'For open_developer_roles_unfilled, matched=true only when the posting has been live for 60+ days. '
                    .'company = the business the event is about (never the news outlet, job board or recruiter); '
                    .'if the post names no specific company, set matched=false with reject_reason "no_company" — general industry news is not a signal. '
                    .'territory = where the event happens (the market entered, the post location). '
                    .'Do NOT reject a post because of its territory (except the export direction rule above): just report the territory. '
                    .'Whether it fits the ICP territories is checked separately, and regions such as "Africa" include every country in them. '
                    .'Extract company_size and revenue only when the post itself states them — never copy ICP filter values. '
                    .'Return JSON only: {"matched":bool,"reject_reason":string,"company":string,"description":string,'
                    .'"source_url":string,"source_date":"YYYY-MM-DD or empty","event_date":"YYYY-MM-DD or empty","territory":string,'
                    .'"named_people":[],"company_size":string,"revenue":string,"industry":string}. '
                    .'named_people = full names of real people taking an action in the post (empty if none). '
                    .'event_date = when the event itself happened or was announced, if the post says (a recent post about a 2022 move has event_date in 2022); empty if unclear. '
                    .'The post may be in German, Dutch, French or another language: judge it the same way, and always write description, territory and industry in English.',
            ],
            [
                'role' => 'user',
                'content' => (string) json_encode([
                    'signal_type' => [
                        'key' => $type->key,
                        'label' => $type->label,
                        'trigger' => $type->trigger_description,
                        'example_valid' => $type->example_valid,
                        'example_invalid' => $type->example_invalid,
                        'feeds_enrichment' => $type->feeds_enrichment,
                    ],
                    'icp_territories' => $brief?->territories ?? [],
                    'job_posting_days_open' => $watch?->first_seen_at
                        ? $watch->first_seen_at->diffInDays(now())
                        : null,
                    'post' => [
                        'text' => $hit->postText,
                        'title' => $hit->title,
                        'url' => $hit->postUrl,
                        'date_raw' => $hit->dateRaw,
                        'posted_at' => $hit->postedAt?->toDateString(),
                    ],
                ]),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $json
     */
    private function fromLlmJson(array $json, RawSocialHit $hit, SignalTypeDefinition $type): DetectedSignal
    {
        $matched = (bool) ($json['matched'] ?? false);
        // Territory fit is the ICP qualifier's call (it knows "Africa" includes Kenya); a
        // rejection whose only reason is territory is overruled, except the export-direction rule.
        $reason = mb_strtolower((string) ($json['reject_reason'] ?? ''));
        if (! $matched && $type->key !== 'export_trade_activity_mention' && filled($json['company'] ?? null)
            && preg_match('/territor|region|location|country|icp/', $reason)) {
            $matched = true;
            $json['reject_reason'] = '';
        }
        $sourceDate = $this->parseDate((string) ($json['source_date'] ?? '')) ?? $hit->postedAt;
        [$size, $revenue] = $this->extractFirmographics($hit);

        return new DetectedSignal(
            matched: $matched,
            signalTypeKey: $type->key,
            company: $this->nonEmpty($json['company'] ?? null),
            description: $this->nonEmpty($json['description'] ?? null),
            sourceUrl: $this->nonEmpty($json['source_url'] ?? null) ?? $hit->postUrl,
            sourceDate: $sourceDate,
            territory: $this->nonEmpty($json['territory'] ?? null),
            namedPeople: $this->stringList($json['named_people'] ?? []),
            companySize: $this->nonEmpty($json['company_size'] ?? null) ?? $size,
            revenue: $this->nonEmpty($json['revenue'] ?? null) ?? $revenue,
            industry: $this->nonEmpty($json['industry'] ?? null),
            rejectReason: $matched ? null : ($this->nonEmpty($json['reject_reason'] ?? null) ?? 'type_mismatch'),
            confirmedByModel: $matched,
            eventDate: $this->parseDate((string) ($json['event_date'] ?? '')),
        );
    }

    private function extractHeuristic(RawSocialHit $hit, SignalTypeDefinition $type): DetectedSignal
    {
        $matched = $this->heuristicMatch($type, $hit);
        $people = $this->heuristicNamedPeople($hit, $type);
        [$size, $revenue] = $this->extractFirmographics($hit);

        return new DetectedSignal(
            matched: $matched,
            signalTypeKey: $type->key,
            // A headline or publisher is not the company behind the event; without the model the
            // company stays unknown and the signal is rejected as not company-specific.
            company: in_array($hit->platform, ['news', 'jobs'], true) ? null : $this->nonEmpty($hit->authorName),
            description: mb_substr($hit->postText, 0, 400),
            sourceUrl: $hit->postUrl,
            sourceDate: $hit->postedAt,
            territory: $this->extractTerritoryFromHit($hit),
            namedPeople: $people,
            companySize: $size,
            revenue: $revenue,
            industry: null,
            rejectReason: $matched ? null : 'type_mismatch',
        );
    }

    private function applyPostGates(
        DetectedSignal $detected,
        RawSocialHit $hit,
        SignalTypeDefinition $type,
        Organization $organization,
        ?IcpBrief $brief,
    ): DetectedSignal {
        if (! $detected->matched) {
            return $detected;
        }

        // A recent post about an old event ("our 2022 trade mission") is not a recent signal.
        $window = max(1, (int) ($type->default_recency_window_days ?: 30));
        if ($detected->eventDate !== null && $detected->eventDate->lt(now()->subDays($window))) {
            return $this->reject($detected, 'event_outside_window');
        }

        if ($type->key === 'open_developer_roles_unfilled' && ! $this->developerRoleHasBeenOpen($organization, $hit)) {
            return $this->reject($detected, 'job_posting_too_recent');
        }

        if ($type->key === 'export_trade_activity_mention' && $brief !== null && ! $this->exportDirectionMatchesIcp($hit, $brief)) {
            return $this->reject($detected, 'export_direction_mismatch');
        }

        return $detected;
    }

    private function reject(DetectedSignal $detected, string $reason): DetectedSignal
    {
        return new DetectedSignal(
            matched: false,
            signalTypeKey: $detected->signalTypeKey,
            company: $detected->company,
            description: $detected->description,
            sourceUrl: $detected->sourceUrl,
            sourceDate: $detected->sourceDate,
            territory: $detected->territory,
            namedPeople: $detected->namedPeople,
            companySize: $detected->companySize,
            revenue: $detected->revenue,
            industry: $detected->industry,
            rejectReason: $reason,
        );
    }

    private function heuristicMatch(SignalTypeDefinition $type, RawSocialHit $hit): bool
    {
        $text = mb_strtolower(trim($hit->postText.' '.$hit->title.' '.$hit->snippet));

        $invalid = match ($type->key) {
            'new_market_entry' => $this->containsAny($text, ['profits rose', 'q3 profits', 'partly due to']),
            'distribution_partnership_announcement' => $this->containsAny($text, ['several new partnerships', 'partnerships forming in the region']),
            'leadership_hire_in_territory', 'diplomatic_corporate_hiring_lagos' => $this->containsAny($text, ["we're hiring", 'job posting', 'job opening', 'apply now'])
                && ! $this->containsAny($text, ['appointed', 'hired', 'joins as', 'named']),
            'export_trade_activity_mention' => false,
            'engineering_team_disruption' => $this->containsAny($text, ['top layoffs', 'listicle']) && ! $this->containsAny($text, ['lays off', 'laid off']),
            'public_complaints_about_software_quality' => $this->containsAny($text, ['so many apps are buggy']) && ! $this->containsAny($text, ['company']),
            default => $this->looksLikeInvalidExample($text, (string) $type->example_invalid),
        };

        if ($invalid) {
            return false;
        }

        $required = match ($type->key) {
            'new_market_entry', 'foreign_company_market_entry_lagos' => ['subsidiary', 'opens', 'opened', 'warehouse', 'new office', 'registers', 'market entry', 'local operation', 'local distribution'],
            'distribution_partnership_announcement' => ['distributor', 'partner', 'appoints', 'exclusive'],
            'leadership_hire_in_territory', 'diplomatic_corporate_hiring_lagos' => ['appointed', 'hired', 'joins as', 'named', 'country manager', 'regional director'],
            'export_trade_activity_mention' => ['export', 'exporting'],
            'hiring_job_post' => ['hiring', 'vacancy', 'job', 'position', 'apply', 'recruiting', 'opening'],
            'trade_fair_exhibitor' => ['exhibit', 'exhibitor', 'expo', 'trade fair', 'trade show', 'booth', 'stand '],
            'local_plant_or_assembly' => ['plant', 'factory', 'assembly', 'warehouse', 'service centre', 'service center', 'facility'],
            'engineering_team_disruption' => ['layoff', 'lays off', 'laid off', 'cto', 'vp eng', 'shutting down'],
            'public_complaints_about_software_quality' => ['crash', 'bug', 'outage', 'downtime', 'broken'],
            'technical_incident_outage_coverage' => ['outage', 'down', 'breach', 'incident'],
            'open_developer_roles_unfilled' => ['job', 'developer', 'engineer', 'hiring'],
            'digital_transformation_announcement' => ['modernize', 'migrate', 'digital', 'legacy', 'transformation'],
            'new_embassy_consulate_presence' => ['embassy', 'consulate'],
            'expat_relocation_activity' => ['expat', 'relocating', 'relocation'],
            'complaints_about_transport_providers' => ['pickup', 'transport', 'driver', 'missed'],
            'new_supply_availability' => ['available', 'in stock', 'harvest', 'capacity', 'price list', 'now taking', 'orders', 'supply', 'mt ', 'tonnes'],
            'supplier_export_readiness' => ['licence', 'license', 'certified', 'certification', 'approval', 'first shipment', 'export'],
            'fund_launch' => ['fund', 'investing in', 'invest in', 'thesis', 'closes', 'launches'],
            'call_for_applications' => ['applications', 'apply', 'call for', 'deadline', 'cohort', 'accelerator', 'grant'],
            default => $this->tokensFromTrigger($type),
        };

        return $this->containsAny($text, $required);
    }

    /**
     * Spec: a developer job posting is a signal only after it has been live
     * 60+ days without being taken down.
     */
    private function developerRoleHasBeenOpen(Organization $organization, RawSocialHit $hit): bool
    {
        $watch = $this->touchJobPostingWatch($organization, $hit);
        if ($watch === null) {
            return false;
        }

        return $watch->first_seen_at !== null
            && $watch->first_seen_at->lte(now()->subDays(JobPostingWatch::UNFILLED_AFTER_DAYS));
    }

    private function touchJobPostingWatch(Organization $organization, RawSocialHit $hit): ?JobPostingWatch
    {
        $url = trim((string) $hit->postUrl);
        if ($url === '' || $organization->id === null) {
            return null;
        }

        $key = hash('sha256', mb_strtolower($url));

        try {
            $watch = JobPostingWatch::query()->firstOrCreate(
                [
                    'organization_id' => $organization->id,
                    'posting_key' => $key,
                ],
                [
                    'source_url' => mb_substr($url, 0, 500),
                    'company_name' => mb_substr((string) ($hit->authorName ?? $hit->title ?? ''), 0, 255) ?: null,
                    'role_title' => mb_substr((string) ($hit->title ?? ''), 0, 255) ?: null,
                    'first_seen_at' => now(),
                    'last_seen_at' => now(),
                ],
            );
            $watch->update(['last_seen_at' => now()]);

            return $watch->fresh() ?? $watch;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Export/trade must be into ICP territories, not out of them to unrelated markets.
     */
    private function exportDirectionMatchesIcp(RawSocialHit $hit, IcpBrief $brief): bool
    {
        $territories = array_values(array_filter(
            array_map(static fn ($t) => mb_strtolower(trim((string) $t)), $brief->territories),
            static fn ($t) => $t !== '',
        ));
        if ($territories === []) {
            return true;
        }

        $text = mb_strtolower(trim($hit->postText.' '.$hit->title.' '.$hit->snippet));
        $destinations = [];

        if (preg_match_all('/export(?:ing|s|ed)?\s+(?:into|to|toward(?:s)?)\s+([a-z][a-z\s]{1,40})/u', $text, $matches)) {
            foreach ($matches[1] as $dest) {
                $destinations[] = trim($dest);
            }
        }

        if (preg_match_all('/export(?:ing|s|ed)?\s+from\s+([a-z][a-z\s]{1,40}?)\s+(?:into|to)\s+([a-z][a-z\s]{1,40})/u', $text, $fromTo)) {
            foreach ($fromTo[1] as $i => $from) {
                $to = $fromTo[2][$i] ?? '';
                $fromMatches = $this->placeMatchesIcp(trim($from), $territories);
                $toMatches = $this->placeMatchesIcp(trim($to), $territories);
                if ($fromMatches && ! $toMatches) {
                    return false;
                }
                if ($toMatches) {
                    return true;
                }
            }
        }

        if ($destinations === []) {
            return true;
        }

        foreach ($destinations as $destination) {
            if ($this->placeMatchesIcp($destination, $territories)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $territories
     */
    private function placeMatchesIcp(string $place, array $territories): bool
    {
        $place = mb_strtolower(trim($place));
        if ($place === '') {
            return false;
        }

        $africa = ['africa', 'kenya', 'nigeria', 'lagos', 'nairobi', 'ghana', 'accra', 'egypt', 'cairo', 'south africa'];
        $icpIsAfrica = false;
        foreach ($territories as $territory) {
            if (str_contains($territory, 'africa') || in_array($territory, $africa, true)) {
                $icpIsAfrica = true;
                break;
            }
            foreach ($africa as $token) {
                if (str_contains($territory, $token)) {
                    $icpIsAfrica = true;
                    break 2;
                }
            }
        }

        foreach ($territories as $territory) {
            if (str_contains($place, $territory) || str_contains($territory, $place)) {
                return true;
            }
            $placeTokens = preg_split('/[,\s]+/u', $place) ?: [];
            $territoryTokens = preg_split('/[,\s]+/u', $territory) ?: [];
            if (array_intersect(
                array_filter($placeTokens, static fn ($t) => mb_strlen($t) >= 3),
                array_filter($territoryTokens, static fn ($t) => mb_strlen($t) >= 3),
            ) !== []) {
                return true;
            }
        }

        if ($icpIsAfrica) {
            foreach ($africa as $token) {
                if (str_contains($place, $token)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array{0: ?string, 1: ?string}
     */
    private function extractFirmographics(RawSocialHit $hit): array
    {
        $text = $hit->postText.' '.$hit->title.' '.$hit->snippet;
        $size = null;
        if (preg_match('/(\d[\d,]*)\s*\+?\s*(?:employees|staff|headcount|people)\b/iu', $text, $match)) {
            $size = $match[1].' employees';
        }

        $revenue = null;
        if (preg_match('/(?:revenue|arr|turnover)[^\d$]{0,20}\$?\s*(\d+(?:\.\d+)?)\s*(million|billion|m|bn|k)\b/iu', $text, $match)
            || preg_match('/\$\s*(\d+(?:\.\d+)?)\s*(million|billion)\s+(?:in\s+)?(?:revenue|arr|turnover)\b/iu', $text, $match)
        ) {
            $revenue = '$'.$match[1].' '.$match[2];
        }

        return [$size, $revenue];
    }

    private function extractTerritoryFromHit(RawSocialHit $hit): ?string
    {
        $text = $hit->postText.' '.$hit->title.' '.$hit->snippet;
        if (preg_match('/\b(Lagos|Nairobi|Kenyan|Kenya|Nigerian|Nigeria|Ghana|Accra|Africa|London|India)\b/u', $text, $match)) {
            return match (mb_strtolower($match[1])) {
                'kenyan' => 'Kenya',
                'nigerian' => 'Nigeria',
                default => $match[1],
            };
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function heuristicNamedPeople(RawSocialHit $hit, SignalTypeDefinition $type): array
    {
        if (! $type->feeds_enrichment) {
            return [];
        }

        if (preg_match_all('/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/u', $hit->postText.' '.$hit->title, $matches)) {
            return array_values(array_unique(array_slice($matches[1], 0, 5)));
        }

        return [];
    }

    /**
     * @param  list<string>  $needles
     */
    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            $needle = mb_strtolower(trim($needle));
            if ($needle !== '' && str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function tokensFromTrigger(SignalTypeDefinition $type): array
    {
        $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($type->label.' '.$type->trigger_description)) ?: [];

        return array_values(array_filter($words, static fn ($w) => mb_strlen($w) >= 5));
    }

    private function looksLikeInvalidExample(string $text, string $exampleInvalid): bool
    {
        $exampleInvalid = mb_strtolower(trim($exampleInvalid));
        if ($exampleInvalid === '') {
            return false;
        }

        return str_contains($exampleInvalid, 'listicle') && str_contains($text, 'top ')
            || str_contains($exampleInvalid, 'vague') && mb_strlen($text) < 80;
    }

    private function parseDate(string $raw): ?Carbon
    {
        $raw = trim($raw);
        if ($raw === '') {
            return null;
        }

        try {
            return Carbon::parse($raw);
        } catch (\Throwable) {
            return null;
        }
    }

    private function nonEmpty(mixed $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    /**
     * @return list<string>
     */
    private function stringList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn ($item) => trim((string) $item),
            $value,
        ), static fn ($item) => $item !== ''));
    }
}
