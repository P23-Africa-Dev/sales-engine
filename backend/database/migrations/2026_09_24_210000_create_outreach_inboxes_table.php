<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_inboxes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('email');
            $table->string('display_name')->nullable();
            $table->string('status', 32)->default('pending'); // pending|confirmed
            $table->string('confirmation_code_hash')->nullable();
            $table->timestamp('confirmation_sent_at')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->unique(['organization_id', 'email']);
            $table->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_inboxes');
    }
};
