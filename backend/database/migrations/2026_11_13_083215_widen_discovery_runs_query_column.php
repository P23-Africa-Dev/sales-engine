<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The run stores the user's own prompt. As varchar(255) any prompt over 255 characters made
     * quick research and lead generation fail with a server error before they started.
     */
    public function up(): void
    {
        Schema::table('discovery_runs', function (Blueprint $table) {
            $table->text('query')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('discovery_runs', function (Blueprint $table) {
            $table->string('query')->nullable()->change();
        });
    }
};
