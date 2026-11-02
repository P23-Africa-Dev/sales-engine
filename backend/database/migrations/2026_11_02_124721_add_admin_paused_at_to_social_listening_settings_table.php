<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            $table->timestamp('admin_paused_at')->nullable()->after('last_run_at');
        });
    }

    public function down(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            $table->dropColumn('admin_paused_at');
        });
    }
};
