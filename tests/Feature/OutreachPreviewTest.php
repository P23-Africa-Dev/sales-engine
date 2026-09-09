<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\OutreachActivity;
use App\Models\SocialSignal;
use App\Services\Outreach\OutreachDraftService;
use Tests\TestCase;

class OutreachPreviewTest extends TestCase
{
    public function test_draft_from_prompt_persists_subject_body_and_to_email(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'FinTech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Jane Doe',
            'score' => 90,
            'summary' => 'Payments lead',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'meta' => ['email' => 'jane@acme.test'],
        ]);

        $draft = app(OutreachDraftService::class)->draftFromPrompt(
            $org,
            $icp,
            'Draft a short intro email',
        );

        $this->assertNotEmpty($draft['activity_ids']);
        $activity = OutreachActivity::query()->find($draft['activity_ids'][0]);
        $this->assertNotNull($activity);
        $this->assertSame('jane@acme.test', $activity->to_email);
        $this->assertSame($draft['subject'], $activity->subject);
        $this->assertSame($draft['body'], $activity->body);
        $this->assertSame(0, (int) $activity->regeneration_count);
        $this->assertSame('jane@acme.test', $draft['to_email']);
    }

    public function test_draft_from_social_signal_persists_draft_fields(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'content_hash' => 'hash-' . uniqid(),
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'post_text' => 'Looking for a logistics partner in Lagos',
            'profile_name' => 'Ada Okeke',
            'persona' => 'Ops Manager',
            'problem' => 'Last-mile delivery',
            'suggested_message' => 'Hi Ada — saw your post about logistics.',
            'score' => 80,
            'status' => 'new',
        ]);

        $draft = app(OutreachDraftService::class)->draftFromSocialSignal($org, $icp, $signal);

        $activity = OutreachActivity::query()->find($draft['activity_id']);
        $this->assertNotNull($activity);
        $this->assertSame($draft['subject'], $activity->subject);
        $this->assertSame($draft['body'], $activity->body);
        $this->assertSame($signal->id, $activity->social_signal_id);
        $this->assertSame(0, (int) $activity->regeneration_count);
    }

    public function test_show_returns_persisted_draft(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Prospect',
            'channel' => 'email draft',
            'preview' => 'Hello there',
            'to_email' => 'buyer@example.com',
            'subject' => 'Quick intro',
            'body' => 'Full outreach body here.',
            'regeneration_count' => 0,
            'occurred_at' => now(),
            'meta' => ['sent' => false],
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/outreach/activities/{$activity->id}")
            ->assertOk()
            ->assertJsonPath('data.activity_id', $activity->id)
            ->assertJsonPath('data.to_email', 'buyer@example.com')
            ->assertJsonPath('data.subject', 'Quick intro')
            ->assertJsonPath('data.body', 'Full outreach body here.')
            ->assertJsonPath('data.channel', 'email')
            ->assertJsonPath('data.sent', false);
    }

    public function test_regenerate_updates_same_activity_and_increments_count(): void
    {
        config(['services.glm.api_key' => '']);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'name' => 'Acme',
            'score' => 70,
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'meta' => ['email' => 'ops@acme.test'],
        ]);

        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'lead_id' => $lead->id,
            'name' => 'Acme',
            'channel' => 'email draft',
            'preview' => 'Original draft',
            'to_email' => 'ops@acme.test',
            'subject' => 'Introduction — ICP',
            'body' => 'Original draft body',
            'regeneration_count' => 0,
            'occurred_at' => now(),
            'meta' => [
                'sent' => false,
                'prompt' => 'Draft a short intro email',
                'icp_profile_id' => $icp->id,
                'target_lead_ids' => [$lead->id],
            ],
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/outreach/activities/{$activity->id}/regenerate", [
                'instructions' => 'Make it shorter and mention Lagos.',
            ])
            ->assertOk()
            ->assertJsonPath('data.activity_id', $activity->id)
            ->assertJsonPath('data.regeneration_count', 1);

        $activity->refresh();
        $this->assertSame(1, (int) $activity->regeneration_count);
        $this->assertNotSame('Original draft body', $activity->body);
        $this->assertSame($response->json('data.body'), $activity->body);
        $this->assertSame('ops@acme.test', $activity->to_email);
        $this->assertStringContainsString('Lagos', (string) ($activity->meta['last_regenerate_instructions'] ?? ''));
    }

    public function test_regenerate_rejects_already_sent_activity(): void
    {
        [, $org] = $this->actingAsOrgMember();
        IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Sent',
            'channel' => 'email draft',
            'preview' => 'Sent body',
            'body' => 'Sent body',
            'subject' => 'Hi',
            'to_email' => 'a@b.com',
            'regeneration_count' => 0,
            'occurred_at' => now(),
            'sent_at' => now(),
            'meta' => ['sent' => true],
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/outreach/activities/{$activity->id}/regenerate", [
                'instructions' => 'Rewrite',
            ])
            ->assertStatus(422);
    }

    public function test_destroy_deletes_org_activity(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Prospect',
            'channel' => 'email draft',
            'preview' => 'Hello there',
            'body' => 'Full body',
            'subject' => 'Hi',
            'to_email' => 'buyer@example.com',
            'regeneration_count' => 0,
            'occurred_at' => now(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->deleteJson("/api/v1/outreach/activities/{$activity->id}")
            ->assertOk()
            ->assertJsonPath('data.deleted', true)
            ->assertJsonPath('data.id', $activity->id);

        $this->assertDatabaseMissing('outreach_activities', ['id' => $activity->id]);
    }
}
