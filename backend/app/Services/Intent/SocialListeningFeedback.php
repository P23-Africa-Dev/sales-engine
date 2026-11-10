<?php

namespace App\Services\Intent;

use App\Models\SocialSignal;
use App\Services\Intent\DTO\RawSocialHit;

/**
 * Learns from what the user did with earlier signals for this ICP, the way
 * Brand24/Awario let users mute authors and sources that keep producing noise.
 *
 * Only repeated, one-sided behaviour counts, so a single dismissal never hides
 * anyone:
 *   - an author dismissed at least twice and never acted on is muted;
 *   - a subreddit dismissed at least three times and never acted on is muted;
 *   - an opportunity label (e.g. "Pain Point") dismissed at least three times
 *     and never acted on scores lower; one the user acts on scores higher.
 * "Acted on" = outreach sent, synced to CRM, or turned into a lead.
 */
class SocialListeningFeedback
{
    public const AUTHOR_MUTE_AFTER = 2;

    public const COMMUNITY_MUTE_AFTER = 3;

    public const LABEL_PENALTY_AFTER = 3;

    public const LABEL_PENALTY = 10.0;

    public const LABEL_BOOST = 5.0;

    private const LOOKBACK_DAYS = 180;

    private const MAX_ROWS = 1000;

    /** @var array<string, true> */
    private array $mutedAuthors = [];

    /** @var array<string, true> */
    private array $mutedCommunities = [];

    /** @var array<string, float> */
    private array $labelAdjustments = [];

    public static function forIcp(int $organizationId, int $icpId): self
    {
        $feedback = new self;

        $rows = SocialSignal::query()
            ->where('organization_id', $organizationId)
            ->where('icp_profile_id', $icpId)
            ->where('updated_at', '>=', now()->subDays(self::LOOKBACK_DAYS))
            ->where(function ($query) {
                $query->whereIn('status', ['dismissed', 'outreached', 'synced'])
                    ->orWhereNotNull('lead_id');
            })
            ->latest('updated_at')
            ->limit(self::MAX_ROWS)
            ->get(['status', 'lead_id', 'author_profile_url', 'profile_name', 'platform', 'post_url', 'intent_label']);

        $authors = [];
        $communities = [];
        $labels = [];
        foreach ($rows as $row) {
            $kept = $row->status !== 'dismissed' || $row->lead_id !== null;
            $bucket = $kept ? 'kept' : 'dismissed';

            $author = self::authorKey($row->author_profile_url, $row->profile_name, (string) $row->platform);
            if ($author !== null) {
                $authors[$author][$bucket] = ($authors[$author][$bucket] ?? 0) + 1;
            }

            $community = self::communityKey($row->post_url);
            if ($community !== null) {
                $communities[$community][$bucket] = ($communities[$community][$bucket] ?? 0) + 1;
            }

            $label = mb_strtolower(trim((string) $row->intent_label));
            if ($label !== '') {
                $labels[$label][$bucket] = ($labels[$label][$bucket] ?? 0) + 1;
            }
        }

        foreach ($authors as $key => $counts) {
            if (($counts['kept'] ?? 0) === 0 && ($counts['dismissed'] ?? 0) >= self::AUTHOR_MUTE_AFTER) {
                $feedback->mutedAuthors[$key] = true;
            }
        }

        foreach ($communities as $key => $counts) {
            if (($counts['kept'] ?? 0) === 0 && ($counts['dismissed'] ?? 0) >= self::COMMUNITY_MUTE_AFTER) {
                $feedback->mutedCommunities[$key] = true;
            }
        }

        foreach ($labels as $label => $counts) {
            if (($counts['kept'] ?? 0) > 0) {
                $feedback->labelAdjustments[$label] = self::LABEL_BOOST;
            } elseif (($counts['dismissed'] ?? 0) >= self::LABEL_PENALTY_AFTER) {
                $feedback->labelAdjustments[$label] = -self::LABEL_PENALTY;
            }
        }

        return $feedback;
    }

    /**
     * Why this post should be skipped before any model call, or null.
     */
    public function muteReason(RawSocialHit $hit): ?string
    {
        $author = self::authorKey($hit->authorProfileUrl, $hit->authorName, $hit->platform);
        if ($author !== null && isset($this->mutedAuthors[$author])) {
            return 'muted_author';
        }

        $community = self::communityKey($hit->postUrl);
        if ($community !== null && isset($this->mutedCommunities[$community])) {
            return 'muted_community';
        }

        return null;
    }

    public function adjustScore(float $score, ?string $intentLabel): float
    {
        $adjustment = $this->labelAdjustments[mb_strtolower(trim((string) $intentLabel))] ?? 0.0;

        return max(0.0, min(95.0, round($score + $adjustment, 1)));
    }

    /**
     * @return array{mutedAuthors: int, mutedCommunities: int, labelAdjustments: array<string, float>}
     */
    public function summary(): array
    {
        return [
            'mutedAuthors' => count($this->mutedAuthors),
            'mutedCommunities' => count($this->mutedCommunities),
            'labelAdjustments' => $this->labelAdjustments,
        ];
    }

    private static function authorKey(?string $profileUrl, ?string $name, string $platform): ?string
    {
        $profileUrl = mb_strtolower(rtrim(trim((string) $profileUrl), '/'));
        if ($profileUrl !== '') {
            return preg_replace('#^https?://(www\.)?#', '', $profileUrl) ?? $profileUrl;
        }

        // Names alone are only trusted where they are handles (u/name, @name).
        $name = mb_strtolower(trim((string) $name));
        if ($name !== '' && preg_match('#^(u/|@)[\w-]{2,}$#', $name)) {
            return $platform.':'.$name;
        }

        return null;
    }

    private static function communityKey(?string $postUrl): ?string
    {
        if ($postUrl !== null && preg_match('#reddit\.com/r/([A-Za-z0-9_]+)/#i', $postUrl, $m)) {
            return 'reddit:'.mb_strtolower($m[1]);
        }

        return null;
    }
}
