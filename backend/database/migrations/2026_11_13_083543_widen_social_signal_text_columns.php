<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The listening scan saves up to 1,000 characters of AI-written description and problem,
     * but these columns were varchar(255): one long description failed the whole scan.
     */
    public function up(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            $table->text('intent_description')->nullable()->change();
            $table->text('problem')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('social_signals', function (Blueprint $table) {
            $table->string('intent_description')->nullable()->change();
            $table->string('problem')->nullable()->change();
        });
    }
};
