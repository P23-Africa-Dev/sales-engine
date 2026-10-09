<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_listening_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('icp_profile_id')->nullable()->constrained('icp_profiles')->nullOnDelete();
            $table->json('enabled_sources')->nullable();
            $table->unsignedSmallInteger('cadence_days')->default(14);
            $table->unsignedTinyInteger('min_score')->default(70);
            $table->json('intent_filters')->nullable();
            $table->string('crm_destination', 64)->default('qualified_pipeline');
            $table->string('outreach_channel_default', 64)->default('email');
            $table->string('sender_mode', 32)->default('platform');
            $table->string('org_verified_from_email')->nullable();
            $table->string('org_verified_domain')->nullable();
            $table->string('verification_status', 32)->default('pending');
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'icp_profile_id'], 'social_listening_settings_org_icp_unique');
        });

        Schema::create('social_listening_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('icp_profile_id')->constrained('icp_profiles')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 32)->default('queued');
            $table->json('stages')->nullable();
            $table->unsignedInteger('signals_created')->default(0);
            $table->text('result_summary')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'icp_profile_id', 'status'], 'sl_runs_org_icp_status_idx');
        });

        Schema::create('social_signals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('icp_profile_id')->constrained('icp_profiles')->cascadeOnDelete();
            $table->foreignId('social_listening_run_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->string('post_url', 2048)->nullable();
            $table->string('content_hash', 64)->nullable();
            $table->string('platform', 64);
            $table->string('source_label', 128);
            $table->string('source_icon', 8)->default('in');
            $table->text('post_text');
            $table->timestamp('posted_at')->nullable();
            $table->string('profile_name')->nullable();
            $table->string('author_profile_url', 2048)->nullable();
            $table->string('persona')->nullable();
            $table->string('company_name')->nullable();
            $table->text('location_text')->nullable();
            $table->string('intent_label', 64)->nullable();
            $table->string('intent_color', 16)->nullable();
            $table->string('intent_description')->nullable();
            $table->string('signal_type', 64)->nullable();
            $table->string('buying_stage', 64)->nullable();
            $table->string('problem')->nullable();
            $table->string('urgency', 64)->nullable();
            $table->decimal('score', 5, 2)->default(0)->index();
            $table->json('reasons')->nullable();
            $table->text('suggested_message')->nullable();
            $table->text('recommended_action')->nullable();
            $table->string('status', 32)->default('new');
            $table->string('f23_lead_id')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'icp_profile_id', 'content_hash'], 'social_signals_dedupe');
            $table->index(['organization_id', 'icp_profile_id', 'status'], 'social_signals_org_icp_status_idx');
        });

        Schema::create('signal_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('social_signal_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('remind_at');
            $table->text('note')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['remind_at', 'completed_at']);
        });

        Schema::create('outreach_identities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reply_to_email');
            $table->string('sender_mode', 32)->default('platform');
            $table->timestamps();
            $table->unique(['organization_id', 'user_id']);
        });

        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->foreignId('social_signal_id')->nullable()->after('company_id')->constrained('social_signals')->nullOnDelete();
            $table->string('sendgrid_message_id')->nullable()->after('meta');
            $table->timestamp('sent_at')->nullable()->after('sendgrid_message_id');
            $table->string('sender_type', 32)->nullable()->after('sent_at');
        });
    }

    public function down(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->dropConstrainedForeignId('social_signal_id');
            $table->dropColumn(['sendgrid_message_id', 'sent_at', 'sender_type']);
        });

        Schema::dropIfExists('outreach_identities');
        Schema::dropIfExists('signal_reminders');
        Schema::dropIfExists('social_signals');
        Schema::dropIfExists('social_listening_runs');
        Schema::dropIfExists('social_listening_settings');
    }
};
