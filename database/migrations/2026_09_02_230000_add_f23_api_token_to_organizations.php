<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->text('f23_api_token')->nullable()->after('factory23_crm_sync_enabled');
            $table->timestamp('f23_api_token_verified_at')->nullable()->after('f23_api_token');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn(['f23_api_token', 'f23_api_token_verified_at']);
        });
    }
};
