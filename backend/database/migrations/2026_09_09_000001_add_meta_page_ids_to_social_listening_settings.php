<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            $table->json('meta_page_ids')->nullable()->after('enabled_sources');
        });
    }

    public function down(): void
    {
        Schema::table('social_listening_settings', function (Blueprint $table) {
            $table->dropColumn('meta_page_ids');
        });
    }
};
