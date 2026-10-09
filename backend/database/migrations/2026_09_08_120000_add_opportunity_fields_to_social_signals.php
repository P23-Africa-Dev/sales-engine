<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            $table->text('summary')->nullable()->after('post_text');
            $table->string('entity_type', 16)->nullable()->after('company_name');
            $table->string('industry')->nullable()->after('entity_type');
            $table->json('key_topics')->nullable()->after('industry');
            $table->json('competitors')->nullable()->after('key_topics');
            $table->text('follow_up_strategy')->nullable()->after('competitors');
            $table->string('recommended_action_title')->nullable()->after('recommended_action');
            $table->text('recommended_action_detail')->nullable()->after('recommended_action_title');
            $table->text('why_this_matters_to_you')->nullable()->after('recommended_action_detail');
            $table->json('benefits')->nullable()->after('why_this_matters_to_you');
            $table->string('personal_recommended_action_title')->nullable()->after('benefits');
            $table->text('personal_recommended_action_detail')->nullable()->after('personal_recommended_action_title');
        });
    }

    public function down(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            $table->dropColumn([
                'summary',
                'entity_type',
                'industry',
                'key_topics',
                'competitors',
                'follow_up_strategy',
                'recommended_action_title',
                'recommended_action_detail',
                'why_this_matters_to_you',
                'benefits',
                'personal_recommended_action_title',
                'personal_recommended_action_detail',
            ]);
        });
    }
};
