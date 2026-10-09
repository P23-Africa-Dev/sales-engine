<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enrichment_logs', function (Blueprint $table) {
            $table->foreignId('social_signal_id')->nullable()->after('lead_id')->constrained('social_signals')->nullOnDelete();
            // Index of the named person within a signal's named_people list (0 for the first/only person).
            $table->unsignedTinyInteger('person_index')->default(0)->after('person_name');

            $table->index(['social_signal_id']);
        });
    }

    public function down(): void
    {
        Schema::table('enrichment_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('social_signal_id');
            $table->dropColumn('person_index');
        });
    }
};
