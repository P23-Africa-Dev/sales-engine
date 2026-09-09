<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->string('delivery_status', 32)->nullable()->after('sender_type'); // sent|delivered|opened|clicked|bounced|dropped|spam|unsubscribed
            $table->timestamp('last_event_at')->nullable()->after('delivery_status');
            $table->text('bounce_reason')->nullable()->after('last_event_at');
        });
    }

    public function down(): void
    {
        Schema::table('outreach_activities', function (Blueprint $table) {
            $table->dropColumn(['delivery_status', 'last_event_at', 'bounce_reason']);
        });
    }
};
