<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('status', 32)->default('active');
            $table->string('industry')->nullable();
            $table->unsignedSmallInteger('crm_stale_days')->default(7);
            $table->index('status');
            $table->index('industry');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropIndex(['industry']);
            $table->dropColumn(['status', 'industry', 'crm_stale_days']);
        });
    }
};
