<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('sg_event_id')->unique();
            $table->string('event_type', 32);
            $table->string('email')->nullable();
            $table->string('sg_message_id')->nullable();
            $table->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('outreach_activity_id')->nullable()->constrained('outreach_activities')->nullOnDelete();
            $table->json('raw_payload')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_webhook_events');
    }
};
