<?php

namespace App\Support;

/**
 * What an ICP means, stated once for every model prompt.
 *
 * An account fills in its ICP with what it is LOOKING FOR right now — the customers,
 * suppliers, partners, investors, deals or other opportunities it needs at the moment.
 * The ICP is never a description of the account's own business, product or current
 * activity. Industries, territories, company sizes and decision makers describe the
 * TARGET the account wants to find; the description and custom prompt state the need
 * in the account's own words.
 */
final class IcpMeaning
{
    public const RULE = 'HOW TO READ THE ICP: the ICP is what this account is LOOKING FOR right now — the customers, suppliers, '
        .'partners, investors, deals or other opportunities it needs at this moment. It is NOT a description of the account\'s '
        .'own business, product, industry or current activity, so never infer what the account does from it. Target industries, '
        .'territories, company sizes and decision makers describe WHO or WHAT the account wants to find; what_they_are_looking_for '
        .'states the need in the account\'s own words. Judge every lead, signal, finding and recommendation by one question: does '
        .'this help the account get what it is looking for? Never call ICP values "your industry", "your business" or "your focus".';

    /**
     * Short form for compact JSON payloads.
     */
    public const SHORT = 'This ICP is what the account is looking for right now (its current need or wanted opportunity), not what the account itself does.';

    /**
     * The account's need in its own words: custom prompt first, then description.
     */
    public static function need(string $customPrompt, string $description): string
    {
        $parts = array_values(array_unique(array_filter([trim($customPrompt), trim($description)])));

        return implode(' — ', $parts);
    }

    /**
     * Structured ICP for a prompt, labelled as the target of a need.
     *
     * @param  list<string>  $industries
     * @param  list<string>  $territories
     * @param  list<string>  $companySizes
     * @param  list<string>  $revenueRanges
     * @param  list<string>  $decisionMakers
     * @param  list<string>  $exclusions
     * @return array<string, mixed>
     */
    public static function payload(
        string $name,
        string $customPrompt,
        string $description,
        array $industries,
        array $territories,
        array $companySizes = [],
        array $revenueRanges = [],
        array $decisionMakers = [],
        array $exclusions = [],
        ?int $minMatchScore = null,
        array $companyLocations = [],
    ): array {
        return array_filter([
            'how_to_read' => self::SHORT,
            'name' => $name,
            'what_they_are_looking_for' => self::need($customPrompt, $description),
            'target_industries' => array_values($industries),
            // Where the target companies are based vs the market they sell into or expand into.
            'target_companies_based_in' => array_values($companyLocations),
            'target_territories' => array_values($territories),
            'target_company_sizes' => array_values($companySizes),
            'target_revenue_ranges' => array_values($revenueRanges),
            'target_decision_makers' => array_values($decisionMakers),
            'not_a_fit' => array_values($exclusions),
            'min_match_score' => $minMatchScore,
        ], static fn ($value): bool => $value !== null && $value !== '' && $value !== []);
    }
}
