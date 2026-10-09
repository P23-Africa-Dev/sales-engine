<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\CrmPipeline;
use App\Models\IcpProfile;
use App\Models\Lead;
use App\Models\SocialSignal;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NativeCrmTest extends TestCase
{
    public function test_discovery_crm_save_persists_business_and_individual_types(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $person = Lead::query()->create(['organization_id' => $org->id, 'name' => 'Ada Okafor', 'meta' => ['entity_type' => 'person']]);
        $business = Lead::query()->create(['organization_id' => $org->id, 'name' => 'Harbor Systems', 'meta' => ['entity_type' => 'company']]);

        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$person->id, $business->id]])->assertOk();

        $this->assertSame('individual', $person->fresh()->meta['lead_type']);
        $this->assertSame('business', $business->fresh()->meta['lead_type']);
        $this->getJson('/api/v1/crm/leads/'.$person->id)->assertOk()->assertJsonPath('data.lead.lead_type', 'individual');
        $this->getJson('/api/v1/crm/leads/'.$business->id)->assertOk()->assertJsonPath('data.lead.lead_type', 'business');
        $this->patchJson('/api/v1/crm/leads/'.$person->id.'/native', ['lead_type' => 'individual', 'next_action' => 'Call Ada'])->assertOk()->assertJsonPath('data.lead.lead_type', 'individual');
        $this->assertSame('individual', $person->fresh()->meta['lead_type']);
        $this->patchJson('/api/v1/crm/leads/'.$person->id.'/native', ['lead_type' => 'unknown'])->assertUnprocessable()->assertJsonValidationErrors('lead_type');
    }

    public function test_default_setup_is_persistent_and_drafts_are_excluded(): void
    {
        [, $org] = $this->actingAsOrgMember();
        Lead::query()->create(['organization_id' => $org->id, 'name' => 'Unreviewed lead', 'stage' => 'new', 'save_status' => 'draft']);

        $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/crm/pipelines')->assertOk()->assertJsonPath('data.items.0.name', 'Default Pipeline');
        $this->getJson('/api/v1/crm/pipelines')->assertJsonCount(1, 'data.items');
        $this->getJson('/api/v1/crm/labels')->assertJsonCount(6, 'data.items');
        $this->getJson('/api/v1/crm/leads')->assertJsonPath('data.pagination.total', 0);
        $this->assertDatabaseCount('crm_pipelines', 1);
    }

    public function test_discovery_saves_selected_pipeline_and_retry_does_not_duplicate_or_call_factory(): void
    {
        Http::preventStrayRequests();
        [, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create(['organization_id' => $org->id, 'name' => 'Ada', 'stage' => 'new', 'meta' => ['email' => 'ada@example.com']]);
        $pipeline = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/pipelines', ['name' => 'Enterprise'])->assertCreated()->json('data.pipeline.id');

        $this->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$lead->id], 'pipeline_id' => $pipeline])->assertOk()->assertJsonPath('data.synced.0.pipeline_id', $pipeline);
        $this->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$lead->id], 'pipeline_id' => $pipeline])->assertJsonPath('data.synced.0.already_synced', true);
        $this->getJson('/api/v1/crm/leads')->assertJsonPath('data.items.0.name', 'Ada')->assertJsonPath('data.pagination.total', 1);
        $this->assertDatabaseHas('crm_entries', ['lead_id' => $lead->id, 'pipeline_id' => $pipeline]);
        $this->assertDatabaseCount('crm_entries', 1);
        Http::assertNothingSent();
    }

    public function test_duplicate_identity_preserves_canonical_contact_and_returns_canonical_id(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $first = Lead::query()->create(['organization_id' => $org->id, 'name' => 'Ada', 'stage' => 'new', 'meta' => ['email' => 'ada@example.com', 'phone' => '+234111111111']]);
        $second = Lead::query()->create(['organization_id' => $org->id, 'name' => 'Ada prospect', 'stage' => 'new', 'meta' => ['email' => 'ADA@example.com', 'website' => 'https://example.com']]);
        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$first->id]])->assertOk();

        $this->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$second->id]])->assertJsonPath('data.synced.0.crm_duplicate', true)->assertJsonPath('data.synced.0.crm_lead_id', $first->id);
        $this->assertDatabaseCount('crm_entries', 1);
        $this->assertSame('+234111111111', $first->fresh()->meta['phone']);
        $this->assertSame('https://example.com', $first->fresh()->meta['website']);
    }

    public function test_foreign_records_and_destinations_are_rejected_without_writes(): void
    {
        [, $org] = $this->actingAsOrgMember();
        [, $other] = $this->createUserWithOrg();
        $foreign = Lead::query()->create(['organization_id' => $other->id, 'name' => 'Private', 'stage' => 'new']);
        $pipeline = CrmPipeline::query()->create(['organization_id' => $other->id, 'name' => 'Private pipeline']);

        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$foreign->id]])->assertOk()->assertJsonCount(0, 'data.synced')->assertJsonCount(1, 'data.errors');
        $this->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$foreign->id], 'pipeline_id' => $pipeline->id])->assertUnprocessable()->assertJsonValidationErrors('pipeline_id');
        $this->getJson('/api/v1/crm/leads/'.$foreign->id)->assertNotFound();
        $this->assertDatabaseCount('crm_entries', 0);
    }

    public function test_manual_edit_stage_notes_activities_and_delete_persist(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads', ['name' => 'Grace', 'email' => 'grace@example.com'])->assertCreated()->json('data.lead.id');

        $this->patchJson('/api/v1/crm/leads/'.$id.'/native', ['status' => 'qualified', 'budget_amount' => 250, 'contacts' => [['name' => 'Grace', 'email' => 'grace@example.com']]])->assertOk()->assertJsonPath('data.lead.status', 'qualified');
        $this->postJson('/api/v1/crm/leads/'.$id.'/notes', ['note' => 'Interested in a demo'])->assertCreated();
        $this->postJson('/api/v1/crm/leads/'.$id.'/activities', ['type' => 'call', 'title' => 'Intro call'])->assertCreated();
        $this->getJson('/api/v1/crm/leads/'.$id)->assertJsonPath('data.lead.notes.0.note', 'Interested in a demo')->assertJsonPath('data.lead.activities.0.title', 'Intro call');
        $this->deleteJson('/api/v1/crm/leads/'.$id)->assertOk();
        $this->getJson('/api/v1/crm/leads')->assertJsonPath('data.pagination.total', 0);
        $this->assertDatabaseCount('crm_notes', 0);
    }

    public function test_social_save_is_local_and_retry_reuses_same_record(): void
    {
        Http::preventStrayRequests();
        [, $org] = $this->actingAsOrgMember();
        $icp = IcpProfile::query()->create(['organization_id' => $org->id, 'name' => 'Social ICP', 'is_active' => true, 'config' => IcpProfile::defaultConfig()]);
        $signal = SocialSignal::query()->create(['organization_id' => $org->id, 'icp_profile_id' => $icp->id, 'content_hash' => 'native-social-test', 'post_url' => 'https://linkedin.com/posts/native-social-test', 'platform' => 'linkedin', 'source_label' => 'LinkedIn', 'source_icon' => 'in', 'profile_name' => 'Social poster', 'company_name' => 'Acme', 'post_text' => 'Looking for a supplier', 'entity_type' => 'individual', 'score' => 80, 'status' => 'new', 'author_profile_url' => 'https://linkedin.com/in/social-poster']);

        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-social-signal', ['signal_ids' => [$signal->id]])->assertOk()->json('data.synced.0.crm_lead_id');
        $this->postJson('/api/v1/crm/leads/from-social-signal', ['signal_ids' => [$signal->id]])->assertJsonPath('data.synced.0.crm_lead_id', $id);
        $this->assertDatabaseCount('crm_entries', 1);
        $this->assertSame($id, $signal->fresh()->lead_id);
        $this->getJson('/api/v1/crm/leads/'.$id)->assertJsonPath('data.lead.source_url', 'https://linkedin.com/in/social-poster');
        Http::assertNothingSent();
    }

    public function test_defaults_preferences_and_deletion_reassign_safely(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $default = $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/crm/pipelines')->json('data.items.0.id');
        $pipeline = $this->postJson('/api/v1/crm/pipelines', ['name' => 'Enterprise'])->json('data.pipeline.id');
        $this->putJson('/api/v1/crm/preferences/preferred-pipeline', ['pipeline_id' => $pipeline])->assertOk();
        $id = $this->postJson('/api/v1/crm/leads', ['name' => 'Preferred destination'])->assertCreated()->json('data.lead.id');
        $this->assertDatabaseHas('crm_entries', ['lead_id' => $id, 'pipeline_id' => $pipeline]);

        $this->postJson('/api/v1/crm/pipelines/'.$default.'/delete', ['force' => true])->assertUnprocessable();
        $this->postJson('/api/v1/crm/pipelines/'.$pipeline.'/delete', ['force' => true])->assertOk();
        $this->assertDatabaseHas('crm_entries', ['lead_id' => $id, 'pipeline_id' => $default]);
        $this->assertDatabaseCount('crm_preferences', 0);
    }

    public function test_import_preview_errors_duplicates_and_export_scope(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $pipeline = $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/crm/pipelines')->json('data.items.0.id');
        $this->postJson('/api/v1/crm/leads', ['name' => 'Existing', 'email' => 'known@example.com'])->assertCreated();
        $payload = ['pipeline_id' => $pipeline, 'duplicate_policy' => 'skip', 'rows' => [['name' => 'Existing', 'email' => 'known@example.com'], ['name' => 'New', 'email' => 'new@example.com'], ['name' => 'Bad', 'email' => 'invalid']]];

        $this->postJson('/api/v1/crm/leads/import/preview', $payload)->assertJsonPath('data.duplicate_count', 1)->assertJsonPath('data.valid_count', 2);
        $this->postJson('/api/v1/crm/leads/import', $payload)->assertJsonPath('data.imported_count', 1)->assertJsonPath('data.skipped_count', 1)->assertJsonCount(1, 'data.failed_rows');
        $this->get('/api/v1/crm/leads/export?format=csv')->assertOk()->assertDownload('crm-leads.csv');
        $this->assertDatabaseCount('crm_entries', 2);
    }

    public function test_regular_member_cannot_change_pipeline_settings_and_invalid_edits_are_rejected(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads', ['name' => 'Member lead'])->json('data.lead.id');
        $org->users()->updateExistingPivot($user->id, ['role' => 'member']);

        $this->postJson('/api/v1/crm/pipelines', ['name' => 'Forbidden'])->assertForbidden();
        $this->patchJson('/api/v1/crm/leads/'.$id.'/native', ['status' => 'invalid'])->assertUnprocessable();
        $this->assertSame('new', Lead::find($id)->stage);
    }

    public function test_stage_management_analytics_assignees_and_pipeline_updates_use_native_records(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $pipeline = $this->withHeaders($this->orgHeaders($org))->getJson('/api/v1/crm/pipelines')->json('data.items.0.id');
        $stage = $this->postJson('/api/v1/crm/labels', ['name' => 'Demo booked', 'color' => '#112233'])->assertCreated()->json('data.label');
        $this->patchJson('/api/v1/crm/labels/'.$stage['id'], ['name' => 'Demo confirmed'])->assertOk()->assertJsonPath('data.label.name', 'Demo confirmed');
        $this->patchJson('/api/v1/crm/pipelines/'.$pipeline, ['name' => 'Main pipeline'])->assertOk();
        $this->postJson('/api/v1/crm/pipelines/'.$pipeline.'/set-default')->assertOk();
        $id = $this->postJson('/api/v1/crm/leads', ['name' => 'Booked lead', 'status' => $stage['slug'], 'assigned_to_user_id' => $user->id])->json('data.lead.id');

        $ids = $this->getJson('/api/v1/crm/labels')->json('data.items');
        $this->postJson('/api/v1/crm/labels/reorder', ['ordered_label_ids' => array_reverse(array_column($ids, 'id'))])->assertOk()->assertJsonPath('data.items.0.id', $stage['id']);
        $this->getJson('/api/v1/crm/leads/pipeline')->assertJsonPath('data.total', 1)->assertJsonPath('data.stages.0.count', 1);
        $this->getJson('/api/v1/crm/leads/analytics')->assertJsonPath('data.total_leads', 1)->assertJsonCount(7, 'data.daily_trend');
        $this->getJson('/api/v1/crm/assignees')->assertJsonPath('data.items.0.id', $user->id);
        $this->getJson('/api/v1/crm/leads/agent-uploads-overview')->assertJsonPath('data.total_uploaded_leads', 0);
        $this->postJson('/api/v1/crm/labels/'.$stage['id'].'/delete')->assertUnprocessable()->assertJsonValidationErrors('label_usage_count');
        $this->postJson('/api/v1/crm/labels/'.$stage['id'].'/delete', ['force' => true])->assertOk()->assertJsonPath('data.deleted_leads_count', 1);
        $this->getJson('/api/v1/crm/leads/'.$id)->assertJsonPath('data.lead.status', 'new');
    }

    public function test_pending_review_is_paginated_and_excludes_native_saves(): void
    {
        [, $org] = $this->actingAsOrgMember();
        for ($i = 1; $i <= 26; $i++) {
            Lead::query()->create(['organization_id' => $org->id, 'name' => 'Pending '.$i, 'stage' => 'new']);
        }
        $first = Lead::query()->where('organization_id', $org->id)->first();
        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$first->id]])->assertOk();

        $this->getJson('/api/v1/crm/discovery-pending?per_page=20&page=2')->assertOk()->assertJsonPath('data.total', 25)->assertJsonCount(5, 'data.items');
        $this->getJson('/api/v1/metrics')->assertJsonPath('data.leads_in_crm', 1);
    }

    public function test_chat_history_reflects_native_membership_after_save_and_delete(): void
    {
        [$user, $org] = $this->actingAsOrgMember();
        $lead = Lead::query()->create(['organization_id' => $org->id, 'name' => 'History lead', 'stage' => 'new']);
        $session = ChatSession::query()->create(['organization_id' => $org->id, 'user_id' => $user->id, 'title' => 'Native history']);
        ChatMessage::query()->create(['chat_session_id' => $session->id, 'role' => 'assistant', 'body' => 'One lead', 'leads' => [['id' => $lead->id, 'name' => 'History lead', 'save_status' => 'draft']]]);
        $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads/from-discovery', ['lead_ids' => [$lead->id]])->assertOk();

        $this->getJson('/api/v1/chat/sessions/'.$session->id.'/messages')->assertOk()->assertJsonPath('data.0.leads.0.native_crm_saved', true);
        $this->deleteJson('/api/v1/crm/leads/'.$lead->id)->assertOk();
        $this->getJson('/api/v1/chat/sessions/'.$session->id.'/messages')->assertJsonPath('data.0.leads.0.native_crm_saved', false);
    }
}
