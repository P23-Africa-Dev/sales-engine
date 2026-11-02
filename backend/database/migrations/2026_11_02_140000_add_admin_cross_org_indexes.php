<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->index(['organization_id', 'channel', 'sent_at'], 'outreach_activities_org_channel_sent_idx');
            $table->index(['organization_id', 'updated_at'], 'outreach_activities_org_updated_idx');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->index(['organization_id', 'score'], 'leads_org_score_idx');
            $table->index(['organization_id', 'save_status'], 'leads_org_save_status_idx');
        });

        Schema::table('social_signals', function (Blueprint $table) {
            $table->index(['status', 'created_at'], 'social_signals_status_created_idx');
            $table->index(['organization_id', 'score'], 'social_signals_org_score_idx');
        });

        Schema::table('crm_entries', function (Blueprint $table) {
            $table->index(['organization_id', 'updated_at'], 'crm_entries_org_updated_idx');
            $table->index(['organization_id', 'stage_id', 'archived_at'], 'crm_entries_org_stage_archived_idx');
        });

        Schema::table('admin_audit_events', function (Blueprint $table) {
            $table->index(['action', 'created_at'], 'admin_audit_events_action_created_idx');
            $table->index(['subject_type', 'subject_id'], 'admin_audit_events_subject_idx');
        });
    }

    public function down(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->dropIndex('outreach_activities_org_channel_sent_idx');
            $table->dropIndex('outreach_activities_org_updated_idx');
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex('leads_org_score_idx');
            $table->dropIndex('leads_org_save_status_idx');
        });

        Schema::table('social_signals', function (Blueprint $table) {
            $table->dropIndex('social_signals_status_created_idx');
            $table->dropIndex('social_signals_org_score_idx');
        });

        Schema::table('crm_entries', function (Blueprint $table) {
            $table->dropIndex('crm_entries_org_updated_idx');
            $table->dropIndex('crm_entries_org_stage_archived_idx');
        });

        Schema::table('admin_audit_events', function (Blueprint $table) {
            $table->dropIndex('admin_audit_events_action_created_idx');
            $table->dropIndex('admin_audit_events_subject_idx');
        });
    }
};
