<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_sessions', function (Blueprint $table) {
            $table->text('context_summary')->nullable()->after('title');
            $table->unsignedBigInteger('context_summary_through_message_id')->nullable()->after('context_summary');
        });
    }

    public function down(): void
    {
        Schema::table('chat_sessions', function (Blueprint $table) {
            $table->dropColumn(['context_summary', 'context_summary_through_message_id']);
        });
    }
};
