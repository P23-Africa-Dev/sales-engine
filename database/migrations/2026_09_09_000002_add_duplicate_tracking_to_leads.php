<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('crm_duplicate_of')->nullable()->after('f23_lead_id');
            $table->text('crm_duplicate_reason')->nullable()->after('crm_duplicate_of');
            $table->json('crm_fields_updated')->nullable()->after('crm_duplicate_reason');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn(['crm_duplicate_of', 'crm_duplicate_reason', 'crm_fields_updated']);
        });
    }
};
