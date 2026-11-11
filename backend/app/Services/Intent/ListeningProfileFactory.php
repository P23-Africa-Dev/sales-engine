<?php

namespace App\Services\Intent;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Cache;

/**
 * Builds the listening plan for a scan. The deterministic profile is always
 * the floor; when the model is available it expands the user's own words into
 * the phrasings buyers actually post (synonyms, first-person pain, competitor
 * names, communities, noise words) — the same "describe your product once,
 * we expand the keywords" step Awario Leads and Sprout's AI Assist do.
 *
 * Firmographic filter fields (industries, territories, sizes, titles) are
 * never sent to the model; only custom_prompt, description and the user's
 * own search keywords are.
 */
class ListeningProfileFactory
{
    private const CACHE_TTL_HOURS = 24;

    public function __construct(
        private readonly GlmClient $glm = new GlmClient,
    ) {}

    public function make(Organization $organization, IcpBrief $brief): ListeningProfile
    {
        $profile = ListeningProfile::fromBrief($brief);
        $refined = $this->refine($organization, $brief);
        if ($refined === null) {
            return $profile;
        }

        return $profile->withOverrides(
            isset($refined['mode']) ? (string) $refined['mode'] : null,
            isset($refined['offer']) ? (string) $refined['offer'] : null,
            isset($refined['competitors']) && is_array($refined['competitors']) ? $refined['competitors'] : null,
            array_key_exists('include_hiring', $refined) ? (bool) $refined['include_hiring'] : null,
            [
                'synonyms' => $refined['synonyms'] ?? null,
                'pain_phrases' => $refined['pain_phrases'] ?? null,
                'communities' => $refined['communities'] ?? null,
                'exclude_terms' => $refined['exclude_terms'] ?? null,
                'buyer' => $refined['buyer'] ?? null,
                'target' => $refined['target'] ?? null,
            ],
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function refine(Organization $organization, IcpBrief $brief): ?array
    {
        $prompt = trim($brief->customPrompt);
        $description = trim($brief->description);
        $keywords = array_values(array_filter(array_map(
            static fn ($keyword) => trim((string) $keyword),
            array_slice($brief->searchKeywords, 0, 8),
        )));

        if (($prompt === '' && $description === '' && $keywords === []) || ! $this->glm->isConfigured()) {
            return null;
        }

        $cacheKey = 'social_listening:plan:v3:'.$organization->id.':'.md5((string) json_encode([$prompt, $description, $keywords, $brief->exclusions]));
        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        try {
            $json = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => $this->systemPrompt(),
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'custom_prompt' => $prompt,
                        'description' => $description,
                        'keywords' => $keywords,
                        'not_a_fit' => array_slice($brief->exclusions, 0, 10),
                    ]),
                ],
            ], 'extract', $organization);
        } catch (\Throwable) {
            return null;
        }

        if (! is_array($json) || (! isset($json['offer']) && ! isset($json['mode']))) {
            return null;
        }

        Cache::put($cacheKey, $json, now()->addHours(self::CACHE_TTL_HOURS));

        return $json;
    }

    private function systemPrompt(): string
    {
        return 'You plan a social-listening scan that finds posts on Reddit, X, LinkedIn and Facebook that are a real opening for this user. '
            .'custom_prompt, description and keywords state what the user is LOOKING FOR right now — their current need or wanted opportunity. '
            .'They are NOT a description of the user\'s own business or product: never assume the user sells what the ICP names. '
            .'Use ONLY those fields. Do not invent an industry, territory, or job title. '
            .'mode is the kind of need: sell when they are looking for customers or clients (companies or people who would buy from them); '
            .'source when they need to obtain a product, service, supplier, vendor, manufacturer or provider; '
            .'invest when they are looking for startups, deals or funding rounds to invest in; partner when they are looking for partners, distributors or collaborators; '
            .'raise when they are looking for investors, funding, grants or accelerators for themselves. '
            .'target is 2 to 5 words naming WHO or WHAT they want to find (e.g. "fintech companies in Lagos", "cocoa suppliers", "seed-stage agritech startups", "impact investors"). '
            .'offer is 2 to 4 words naming the thing the posts that fill this need are about, in the words people actually type: '
            .'for sell, what the target customers would be asking for (only if the user says what they provide; otherwise repeat the target); '
            .'for source, what they want to obtain (e.g. "payroll software", "cocoa beans"); for invest/partner/raise, the sector or theme. '
            .'synonyms is 3 to 6 other short phrases (1 to 4 words) people use for the same thing, including plain-language and category terms. '
            .'pain_phrases is 3 to 6 short first-person phrases (3 to 7 words) that the OTHER side writes when they are the opening: '
            .'for sell, a target customer describing the problem (e.g. "our drivers keep faking fuel receipts"); for source, a supplier offering it (e.g. "we supply bulk cocoa beans"); '
            .'for raise, an investor inviting pitches; for invest, a founder raising; for partner, an organisation seeking partners. '
            .'competitors is an array of real product or company names in this space (named by the user first, then the best-known alternatives), max 5, else []. '
            .'communities is up to 5 subreddit names (no r/ prefix) where these openings are posted. Only name subreddits you are confident exist. '
            .'exclude_terms is up to 8 single words or short phrases that mark noise for this search (e.g. job ads, courses, unrelated meanings of the offer words). '
            .'buyer is one sentence describing who counts as a real opening for this need (role, situation). not_a_fit lists who the user excludes; never target them. '
            .'include_hiring is true only when they explicitly want hiring or appointment news. '
            .'Return JSON only: {"mode":"sell|source|invest|partner|raise","target":"...","offer":"...","synonyms":[],"pain_phrases":[],"competitors":[],"communities":[],"exclude_terms":[],"buyer":"...","include_hiring":false}';
    }
}
