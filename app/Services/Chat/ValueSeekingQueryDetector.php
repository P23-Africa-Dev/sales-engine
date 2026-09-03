<?php

namespace App\Services\Chat;

class ValueSeekingQueryDetector
{
    /**
     * True when the user is asking for external/current opportunities or actionable intel
     * that should be backed by live web/social retrieval (lighter than Quick Research).
     */
    public function matches(string $body): bool
    {
        $normalized = mb_strtolower(trim($body));
        if ($normalized === '' || mb_strlen($normalized) < 12) {
            return false;
        }

        // Skip pure greetings / tiny chit-chat.
        if (preg_match('/^(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening))[\s!.?]*$/u', $normalized)) {
            return false;
        }

        $patterns = [
            '/\bopportunit(y|ies)\b/u',
            '/\b(what(\'s| is| are)|show|find|give|list|any)\b.{0,40}\b(out there|right now|currently|this (week|month)|today)\b/u',
            '/\btake advantage\b/u',
            '/\b(market|industry|sector)\s+(trends?|signals?|news|shifts?)\b/u',
            '/\b(what|which)\b.{0,30}\b(should i|can i|to)\b.{0,40}\b(pursue|target|focus|act on|jump on)\b/u',
            '/\b(funding|investment|grants?|tenders?|rfp|rfq|partnerships?)\b.{0,40}\b(in|for|around)?\b/u',
            '/\b(what.?s happening|latest|breaking|emerging)\b.{0,40}\b(in|for|around)\b/u',
            '/\b(use|based on|according to)\s+(my\s+)?icp\b/u',
            '/\breal[- ]?time\b/u',
            '/\b(hot|timely|actionable)\s+(deals?|signals?|leads?|plays?)\b/u',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $normalized)) {
                return true;
            }
        }

        return false;
    }
}
