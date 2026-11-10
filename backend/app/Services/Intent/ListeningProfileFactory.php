<?php

namespace App\Services\Intent;

use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Intent\DTO\ListeningProfile;
use App\Services\Llm\GlmClient;

/**
 * Deterministic profile, optionally tightened by the model when the ICP
 * prompt is long. Firmographic fields are never sent to the model.
 */
class ListeningProfileFactory
{
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
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function refine(Organization $organization, IcpBrief $brief): ?array
    {
        $prompt = trim($brief->customPrompt);
        $description = trim($brief->description);
        if (($prompt === '' && $description === '') || ! $this->glm->isConfigured()) {
            return null;
        }

        try {
            $json = $this->glm->chatJson([
                [
                    'role' => 'system',
                    'content' => 'Compress a user\'s stated interest into a social-listening profile. Use ONLY custom_prompt and description. '
                        .'Do not invent an industry, territory, or job title. '
                        .'mode is sell when they want buyers or people asking for a product, invest when they want funding or deals, partner when they want collaborations. '
                        .'offer is 2 to 5 words naming what they sell or the theme they track. '
                        .'competitors is an array of product names they mention, else []. '
                        .'include_hiring is true only when they explicitly want hiring or appointment news. '
                        .'Return JSON: {"mode":"sell|invest|partner","offer":"...","competitors":[],"include_hiring":false}',
                ],
                [
                    'role' => 'user',
                    'content' => json_encode([
                        'custom_prompt' => $prompt,
                        'description' => $description,
                    ]),
                ],
            ], 'extract', $organization);
        } catch (\Throwable) {
            return null;
        }

        if (! is_array($json) || (! isset($json['offer']) && ! isset($json['mode']))) {
            return null;
        }

        return $json;
    }
}
