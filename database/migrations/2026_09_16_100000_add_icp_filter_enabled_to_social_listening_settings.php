<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            // Operational kill switch for Stage 1 (new_plan.md's ICP hard filter — see
            // IcpFilterService / docs/backend_implementation_plan.md Phase 8). Defaults
            // true (the correct, spec-compliant behavior); exists so a single org's scan
            // can be reverted to the old soft-scoring behavior without a deploy if the
            // hard filter turns out to be misbehaving for that org's data.
            $table->boolean('icp_filter_enabled')->default(true)->after('intent_filters');
        });
    }

    public function down(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            $table->dropColumn('icp_filter_enabled');
        });
    }
};
