<?php

namespace Tests\Unit\Intent;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Models\SocialSignal;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\IcpFiltering\DTO\CandidateCompany;
use App\Services\IcpFiltering\IcpFilterService;
use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\SocialListeningFeedback;
use Tests\TestCase;

class SocialListeningFeedbackTest extends TestCase
{
    public function test_repeated_dismissals_mute_an_author_and_a_community(): void
    {
        [$org, $icp] = $this->orgAndIcp();

        $this->signal($org->id, $icp->id, 'dismissed', 'https://www.reddit.com/user/spammy', 'https://www.reddit.com/r/noise/comments/a1/x/', 'Recommendation');
        $this->signal($org->id, $icp->id, 'dismissed', 'https://www.reddit.com/user/spammy', 'https://www.reddit.com/r/noise/comments/a2/x/', 'Recommendation');
        $this->signal($org->id, $icp->id, 'dismissed', 'https://www.reddit.com/user/other', 'https://www.reddit.com/r/noise/comments/a3/x/', 'Recommendation');
        // One dismissal alone never mutes anyone.
        $this->signal($org->id, $icp->id, 'dismissed', 'https://www.reddit.com/user/once', 'https://www.reddit.com/r/logistics/comments/b1/x/', 'Switching');

        $feedback = SocialListeningFeedback::forIcp($org->id, $icp->id);

        $this->assertSame('muted_author', $feedback->muteReason($this->hit('https://www.reddit.com/user/spammy', 'https://www.reddit.com/r/logistics/comments/c1/x/')));
        $this->assertSame('muted_community', $feedback->muteReason($this->hit('https://www.reddit.com/user/new', 'https://www.reddit.com/r/noise/comments/c2/x/')));
        $this->assertNull($feedback->muteReason($this->hit('https://www.reddit.com/user/once', 'https://www.reddit.com/r/logistics/comments/c3/x/')));
        $this->assertSame(['mutedAuthors' => 1, 'mutedCommunities' => 1], array_slice($feedback->summary(), 0, 2));
    }

    public function test_acting_on_an_author_or_label_overrides_dismissals(): void
    {
        [$org, $icp] = $this->orgAndIcp();

        foreach (['d1', 'd2', 'd3'] as $id) {
            $this->signal($org->id, $icp->id, 'dismissed', 'https://x.com/ada', "https://x.com/ada/status/{$id}", 'Pain Point');
        }
        $this->signal($org->id, $icp->id, 'outreached', 'https://x.com/ada', 'https://x.com/ada/status/k1', 'Pain Point');
        foreach (['p1', 'p2', 'p3'] as $id) {
            $this->signal($org->id, $icp->id, 'dismissed', "https://x.com/{$id}", "https://x.com/{$id}/status/1", 'Price');
        }

        $feedback = SocialListeningFeedback::forIcp($org->id, $icp->id);

        $this->assertNull($feedback->muteReason($this->hit('https://x.com/ada', 'https://x.com/ada/status/new')));
        $this->assertSame(65.0, $feedback->adjustScore(60, 'Pain Point'));
        $this->assertSame(50.0, $feedback->adjustScore(60, 'Price'));
        $this->assertSame(60.0, $feedback->adjustScore(60, 'Switching'));
    }

    public function test_icp_exclusions_drop_matching_discovery_candidates(): void
    {
        $brief = new IcpBrief(
            name: 'Haulage',
            description: '',
            industries: [],
            territories: [],
            companySizes: [],
            decisionMakers: [],
            customPrompt: 'haulage fleets',
            minMatchScore: 60,
            autoSyncCrm: false,
            query: '',
            exclusions: ['freight brokers', 'staffing agencies'],
        );
        $filter = new IcpFilterService;

        $broker = $filter->passes($brief, new CandidateCompany(profileText: 'Swift Freight Brokerage Ltd, logistics'), []);
        $agency = $filter->passes($brief, new CandidateCompany(profileText: 'Prime Staffing Agency'), []);
        $fleet = $filter->passes($brief, new CandidateCompany(profileText: 'Lagos Haulage Co, trucking fleet operator'), []);
        $notEvaluated = $filter->passes($brief, new CandidateCompany, []);

        $this->assertFalse($broker->passed);
        $this->assertFalse($broker->reasons['exclusions']);
        $this->assertFalse($agency->passed);
        $this->assertTrue($fleet->passed);
        $this->assertArrayNotHasKey('exclusions', $notEvaluated->reasons);
    }

    /**
     * @return array{0: Organization, 1: IcpProfile}
     */
    private function orgAndIcp(): array
    {
        [, $org] = $this->createUserWithOrg();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Fleet',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        return [$org, $icp];
    }

    private function signal(int $orgId, int $icpId, string $status, string $author, string $url, string $label): void
    {
        SocialSignal::query()->create([
            'organization_id' => $orgId,
            'icp_profile_id' => $icpId,
            'post_url' => $url,
            'content_hash' => md5($url),
            'platform' => str_contains($url, 'reddit') ? 'reddit' : 'x',
            'source_label' => 'Post',
            'source_icon' => 'r',
            'post_text' => 'text',
            'author_profile_url' => $author,
            'intent_label' => $label,
            'status' => $status,
            'score' => 60,
        ]);
    }

    private function hit(string $author, string $url): RawSocialHit
    {
        return new RawSocialHit(
            platform: str_contains($url, 'reddit') ? 'reddit' : 'x',
            sourceLabel: 'Post',
            sourceIcon: 'r',
            postText: 'Anyone recommend a fleet tracking tool for 30 trucks?',
            postUrl: $url,
            snippet: null,
            title: null,
            authorProfileUrl: $author,
        );
    }
}
