<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('save_status', 16)->default('draft')->after('stage');
            $table->index(['organization_id', 'save_status']);
        });

        DB::table('leads')
            ->whereNotNull('synced_to_f23_at')
            ->update(['save_status' => 'saved']);

        DB::table('leads')
            ->whereNull('synced_to_f23_at')
            ->where('save_status', 'draft')
            ->update(['save_status' => 'draft']);
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'save_status']);
            $table->dropColumn('save_status');
        });
    }
};
