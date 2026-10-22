<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\OutreachActivity;
use App\Models\SignalReminder;
use App\Models\SocialSignal;
use Tests\TestCase;

class SalesEngineGapsTest extends TestCase
{
    public function test_metrics_include_week_change_and_trend(): void
    {
        [, $org] = $this->actingAsOrgMember();
        Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'New lead',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
            'created_at' => now(),
        ]);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/metrics')
            ->assertOk()
            ->assertJsonPath('data.leads_pending_review', 1)
            ->assertJsonStructure([
                'data' => [
                    'leads_discovered_change_percent',
                    'leads_pending_review_change_percent',
                    'leads_in_crm_change_percent',
                ],
            ]);

        $this->getJson('/api/v1/metrics/trend?metric=leads_discovered&range=7d')
            ->assertOk()
            ->assertJsonCount(7, 'data.points')
            ->assertJsonStructure(['data' => ['change_percent', 'direction', 'highlight_date']]);
    }

    public function test_usage_reports_the_monthly_search_limit(): void
    {
        [, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/usage')
            ->assertOk()
            ->assertJsonPath('data.searches.used', 0)
            ->assertJsonPath('data.searches.limit', 500);
    }

    public function test_rejected_leads_leave_pending_review(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create([
            'organization_id' => $org->id,
            'name' => 'Wrong fit',
            'stage' => 'new',
            'save_status' => Lead::SAVE_DRAFT,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/leads/'.$lead->id.'/feedback', ['verdict' => 'not_relevant', 'reason' => 'wrong industry'])
            ->assertOk()
            ->assertJsonPath('data.save_status', 'rejected');

        $this->getJson('/api/v1/crm/discovery-pending')
            ->assertOk()
            ->assertJsonPath('data.total', 0);
    }

    public function test_sent_filter_includes_rows_without_a_delivery_status(): void
    {
        [, $org] = $this->actingAsOrgMember();
        OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Sent without webhook',
            'channel' => 'email',
            'sent_at' => now(),
            'delivery_status' => null,
        ]);
        OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Draft',
            'channel' => 'email draft',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/outreach/activities?status=sent')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.metrics.smsCount', 0);
    }

    public function test_sms_dashboard_counts_sent_and_delivered(): void
    {
        [, $org] = $this->actingAsOrgMember();
        OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Text',
            'channel' => 'sms',
            'sent_at' => now(),
            'delivery_status' => 'delivered',
        ]);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/outreach/dashboard')
            ->assertOk()
            ->assertJsonPath('data.metrics.1.total', 1)
            ->assertJsonPath('data.metrics.1.primaryCount', 1)
            ->assertJsonPath('data.metrics.1.secondaryCount', 1)
            ->assertJsonPath('data.metrics.2.configured', false);
    }

    public function test_whatsapp_and_voice_report_not_configured(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $activity = OutreachActivity::query()->create([
            'organization_id' => $org->id,
            'name' => 'Draft',
            'channel' => 'whatsapp draft',
            'body' => 'Hello',
        ]);

        config([
            'services.infobip.whatsapp_sender' => null,
            'services.infobip.voice_from' => null,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/activities/'.$activity->id.'/send', [
                'channel' => 'whatsapp',
                'to_phone' => '+2348012345678',
                'body' => 'Hello',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'whatsapp_not_configured');

        $this->postJson('/api/v1/calls', ['to_number' => '+2348012345678'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'voice_not_configured');
    }

    public function test_chat_feedback_is_stored_on_the_message(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
        ]);
        $message = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Hello',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/chat/messages/'.$message->id.'/feedback', ['rating' => 'up'])
            ->assertOk()
            ->assertJsonPath('data.feedback_rating', 'up');
    }

    public function test_reminder_can_be_listed_and_cancelled(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        $signal = SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'content_hash' => 'hash-1',
            'post_url' => 'https://example.com/post',
            'platform' => 'linkedin',
            'source_label' => 'LinkedIn Post',
            'source_icon' => 'in',
            'score' => 80,
            'profile_name' => 'Ada',
            'company_name' => 'Acme',
            'post_text' => 'Need a vendor',
            'buying_stage' => 'Consideration',
            'status' => 'new',
        ]);
        $reminder = SignalReminder::query()->create([
            'organization_id' => $org->id,
            'social_signal_id' => $signal->id,
            'user_id' => $user->id,
            'remind_at' => now()->addDay(),
            'note' => 'Follow up',
        ]);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/reminders?status=upcoming')
            ->assertOk()
            ->assertJsonPath('data.0.id', $reminder->id)
            ->assertJsonPath('data.0.signal.company', 'Acme');

        $this->deleteJson('/api/v1/reminders/'.$reminder->id)->assertOk();
        $this->getJson('/api/v1/reminders?status=upcoming')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_social_filters_and_icp_options(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create([
            'organization_id' => $org->id,
            'name' => 'ICP',
            'is_active' => true,
            'config' => IcpProfile::defaultConfig(),
        ]);
        SocialSignal::query()->create([
            'organization_id' => $org->id,
            'icp_profile_id' => $icp->id,
            'content_hash' => 'hash-2',
            'post_url' => 'https://example.com/x',
            'platform' => 'x',
            'source_label' => 'X/Twitter Post',
            'source_icon' => 'x',
            'score' => 70,
            'post_text' => 'Looking',
            'buying_stage' => 'Decision',
            'status' => 'new',
        ]);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/social-listening/filters')
            ->assertOk()
            ->assertJsonPath('data.sources.0.value', 'X/Twitter Post')
            ->assertJsonPath('data.buying_stages.0.value', 'Decision');

        $this->getJson('/api/v1/icp-profiles/options')
            ->assertOk()
            ->assertJsonPath('data.signal_type_packs.0.value', 'default');
    }
}
