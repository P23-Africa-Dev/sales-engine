<?php

namespace Tests\Feature;

use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\SocialListeningSetting;
use App\Models\SocialSignal;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SignalPosterCrmSyncTest extends TestCase
{
    public function test_sync_to_crm_creates_person_lead_and_exposes_author_profile(): void
    {
        config([
            'services.factory23.api_url' => '',
            'services.glm.api_key' => '',
            'services.hunter.api_key' => '',
            'services.apollo.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.serper.api_key' => '',
        ]);

        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'Tech ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);

        SocialListeningSetting::query()->create(array_merge(
            SocialListeningSetting::defaultsForOrg($org->id, $icp->id),
            ['crm_destination' => 'qualified_pipeline'],
        ));

        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'post_url' => 'https://www.linkedin.com/posts/jordan-blake_activity-55',
            'content_hash' => 'poster-crm-hash-1',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'post_text' => 'Anyone recommend a sales automation platform?',
            'summary' => 'Looking for sales automation',
            'profile_name' => 'Jordan Blake',
            'author_profile_url' => 'https://www.linkedin.com/in/jordan-blake',
            'persona' => 'Head of Growth',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'industry' => 'SaaS',
            'location_text' => 'Accra, GH',
            'intent_label' => 'Recommendation',
            'intent_color' => '#6ec758',
            'intent_description' => 'Actively asking for tools',
            'signal_type' => 'recommendation',
            'buying_stage' => 'Consideration',
            'problem' => 'Needs sales automation',
            'urgency' => 'High',
            'score' => 81,
            'status' => 'new',
            'key_topics' => ['automation'],
            'competitors' => [],
            'reasons' => ['Matches ICP'],
        ]);

        Http::fake();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/social-listening/signals/{$signal->id}/sync-to-crm");

        $response->assertOk()
            ->assertJsonPath('data.signal.profile', 'Jordan Blake')
            ->assertJsonPath('data.signal.author_profile_url', 'https://www.linkedin.com/in/jordan-blake')
            ->assertJsonPath('data.signal.platform', 'linkedin');

        $leadId = (int) $response->json('data.lead_id');
        $this->assertGreaterThan(0, $leadId);
        $this->assertSame($leadId, (int) $response->json('data.signal.lead_id'));

        $lead = Lead::query()->findOrFail($leadId);

        $this->assertSame('Jordan Blake', $lead->name);
        $this->assertSame('Head of Growth', $lead->meta['title'] ?? null);
        $this->assertSame('Accra, GH', $lead->meta['location'] ?? null);
        $this->assertSame('https://www.linkedin.com/in/jordan-blake', $lead->meta['linkedin_url'] ?? null);
        $this->assertSame('qualified_pipeline', $lead->meta['crm_destination'] ?? null);
        $this->assertSame($signal->id, $lead->meta['social_signal_id'] ?? null);

        $signal->refresh();
        $this->assertSame($leadId, $signal->lead_id);
        $this->assertContains($signal->status, ['reviewed', 'synced']);
    }

    public function test_signal_resource_includes_author_profile_url_and_platform(): void
    {
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
            'post_url' => 'https://x.com/founder/status/1',
            'content_hash' => 'poster-resource-hash',
            'platform' => 'x',
            'source_label' => 'X/Twitter Post',
            'source_icon' => 'X',
            'post_text' => 'Raising a seed round',
            'profile_name' => '@founder',
            'author_profile_url' => 'https://x.com/founder',
            'persona' => 'Founder',
            'company_name' => 'Individual',
            'entity_type' => 'individual',
            'intent_label' => 'Funding Event',
            'intent_color' => '#f5a524',
            'signal_type' => 'funding_event',
            'score' => 70,
            'status' => 'new',
        ]);

        $response = $this->withHeaders($this->orgHeaders($org))
            ->getJson("/api/v1/social-listening/signals/{$signal->id}");

        $response->assertOk()
            ->assertJsonPath('data.author_profile_url', 'https://x.com/founder')
            ->assertJsonPath('data.platform', 'x')
            ->assertJsonPath('data.profile', '@founder');
    }
}
