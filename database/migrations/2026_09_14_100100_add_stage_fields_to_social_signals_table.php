<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            // Stage 1 (ICP Filter) audit trail.
            $table->boolean('icp_filter_passed')->default(false)->after('icp_profile_id');
            $table->json('icp_filter_reasons')->nullable()->after('icp_filter_passed');

            // Stage 2 (Signal Detection) — discrete signal-type registry reference + grounding.
            $table->string('signal_type_key', 64)->nullable()->after('signal_type');
            $table->json('named_people')->nullable()->after('signal_type_key');
            $table->string('territory', 255)->nullable()->after('location_text');

            // Stage 3 (Enrichment) — rollup of enrichment_logs attempts for fast reads.
            // Existing rows default to 'not_attempted', which is correct: they predate this column.
            $table->string('enrichment_status', 24)->default('not_attempted')->after('status');
            $table->timestamp('enrichment_attempted_at')->nullable()->after('enrichment_status');
        });
    }

    public function down(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            $table->dropColumn([
                'icp_filter_passed',
                'icp_filter_reasons',
                'signal_type_key',
                'named_people',
                'territory',
                'enrichment_status',
                'enrichment_attempted_at',
            ]);
        });
    }
};
