<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outreach_domain_authentications', function (Blueprint $table) {
            $table->string('integrity_status', 16)->nullable()->after('verification_status');
            $table->json('integrity_checks')->nullable()->after('integrity_status');
            $table->timestamp('integrity_checked_at')->nullable()->after('integrity_checks');
            $table->timestamp('warmup_started_at')->nullable()->after('integrity_checked_at');
        });
    }

    public function down(): void
    {
        Schema::table('outreach_domain_authentications', function (Blueprint $table) {
            $table->dropColumn([
                'integrity_status',
                'integrity_checks',
                'integrity_checked_at',
                'warmup_started_at',
            ]);
        });
    }
};
