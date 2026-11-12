<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per signal type: who to contact for it (overrides the ICP's decision makers) and how to
     * phrase its news searches ("{industry} opens subsidiary in {territory}").
     */
    public function up(): void
    {
        Schema::table('signal_type_definitions', function (Blueprint $table) {
            $table->json('target_roles')->nullable()->after('default_recency_window_days');
            $table->json('search_phrases')->nullable()->after('target_roles');
        });
    }

    public function down(): void
    {
        Schema::table('signal_type_definitions', function (Blueprint $table) {
            $table->dropColumn(['target_roles', 'search_phrases']);
        });
    }
};
