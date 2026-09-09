<?php

namespace Tests\Unit\Outreach;

use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\Organization;
use App\Services\Outreach\OutreachDraftService;
use Tests\TestCase;

class OutreachDraftServiceTest extends TestCase
{
    public function test_draft_includes_icp_alignment_note_separate_from_body(): void
    {
        config(['services.glm.api_key' => '']);

        $org = Organization::query()->create([
            'name' => 'Org',
            'slug' => 'org-outreach-' . uniqid(),
        ]);

        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'My Tech ICP',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['FinTech'],
                'territories' => ['Lagos, NG'],
            ]),
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Acme Fintech',
            'score' => 80,
            'summary' => 'Payments company in Lagos.',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'meta' => [
                'icp_relevance_reason' => 'Fits your FinTech focus in Lagos, NG.',
            ],
        ]);

        $draft = app(OutreachDraftService::class)->draftFromPrompt(
            $org,
            $icp,
            'Draft a short intro email',
        );

        $this->assertArrayHasKey('icp_alignment_note', $draft);
        $this->assertNotSame('', trim($draft['icp_alignment_note']));
        $this->assertStringContainsString('FinTech', $draft['icp_alignment_note']);
        $this->assertStringContainsString('Fits your FinTech focus', $draft['icp_alignment_note']);

        // Body remains the sendable draft — no ICP analysis preamble baked into it.
        $this->assertStringNotContainsString('Why these leads', $draft['body']);
        $this->assertStringNotContainsString('**Why these leads**', $draft['body']);

        $activity = \App\Models\OutreachActivity::query()->find($draft['activity_ids'][0] ?? null);
        $this->assertNotNull($activity);
        $this->assertSame($draft['body'], $activity->body);
        $this->assertSame($draft['subject'], $activity->subject);
        $this->assertSame(0, (int) $activity->regeneration_count);
    }
}
