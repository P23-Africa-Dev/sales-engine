<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->string('to_email')->nullable()->after('preview');
            $table->string('subject')->nullable()->after('to_email');
            $table->text('body')->nullable()->after('subject');
            $table->unsignedInteger('regeneration_count')->default(0)->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->dropColumn(['to_email', 'subject', 'body', 'regeneration_count']);
        });
    }
};
