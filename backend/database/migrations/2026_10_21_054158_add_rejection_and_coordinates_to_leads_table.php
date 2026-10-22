<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->timestamp('rejected_at')->nullable()->after('save_status');
            $table->string('rejection_reason')->nullable()->after('rejected_at');
            $table->decimal('latitude', 10, 7)->nullable()->after('rejection_reason');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->timestamp('geocoded_at')->nullable()->after('longitude');
            $table->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'created_at']);
            $table->dropColumn(['rejected_at', 'rejection_reason', 'latitude', 'longitude', 'geocoded_at']);
        });
    }
};
