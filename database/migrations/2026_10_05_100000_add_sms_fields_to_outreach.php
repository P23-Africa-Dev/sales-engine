<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->string('to_phone', 32)->nullable()->after('to_email');
        });

        Schema::table('outreach_suppressions', function (Blueprint $table) {
            $table->string('phone', 32)->nullable()->after('email');
            $table->index(['phone']);
        });
    }

    public function down(): void
    {
        Schema::table('outreach_suppressions', function (Blueprint $table) {
            $table->dropIndex(['phone']);
            $table->dropColumn('phone');
        });

        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->dropColumn('to_phone');
        });
    }
};
