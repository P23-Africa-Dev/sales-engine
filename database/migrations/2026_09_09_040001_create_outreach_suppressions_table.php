<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_suppressions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('email');
            $table->string('reason', 32); // bounce|dropped|spamreport|unsubscribe|group_unsubscribe|manual
            $table->string('sendgrid_event_id')->nullable();
            $table->timestamp('suppressed_at');
            $table->timestamps();
            $table->unique(['organization_id', 'email', 'reason'], 'outreach_suppressions_org_email_reason_unique');
            $table->index(['email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_suppressions');
    }
};
