<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->char('country', 2)->nullable()->after('slug');
            $table->string('team_size', 16)->nullable()->after('country');
            $table->string('purpose', 64)->nullable()->after('team_size');
            $table->string('user_type', 32)->nullable()->after('purpose');
            $table->timestamp('onboarding_completed_at')->nullable()->after('user_type');
            $table->unsignedInteger('search_limit_monthly')->nullable()->after('onboarding_completed_at');
            $table->unsignedInteger('outreach_email_limit_monthly')->nullable()->after('search_limit_monthly');
            $table->unsignedInteger('enrichment_limit_monthly')->nullable()->after('outreach_email_limit_monthly');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn([
                'country',
                'team_size',
                'purpose',
                'user_type',
                'onboarding_completed_at',
                'search_limit_monthly',
                'outreach_email_limit_monthly',
                'enrichment_limit_monthly',
            ]);
        });
    }
};
