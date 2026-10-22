<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('signal_reminders', function (Blueprint $table) {
            $table->timestamp('cancelled_at')->nullable()->after('completed_at');
        });

        DB::table('social_signals')->where('source_label', 'X Post')->update([
            'source_label' => 'X/Twitter Post',
        ]);
    }

    public function down(): void
    {
        Schema::table('signal_reminders', function (Blueprint $table) {
            $table->dropColumn('cancelled_at');
        });
    }
};
