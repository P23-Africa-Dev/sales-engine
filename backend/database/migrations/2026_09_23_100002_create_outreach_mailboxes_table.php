<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_mailboxes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32); // google|microsoft|zoho|smtp
            $table->string('email');
            $table->string('status', 32)->default('connected'); // connected|error|disconnected
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->json('scopes')->nullable();
            $table->json('provider_metadata')->nullable();
            $table->string('smtp_host')->nullable();
            $table->unsignedSmallInteger('smtp_port')->nullable();
            $table->string('smtp_encryption', 16)->nullable(); // tls|ssl|null
            $table->string('smtp_username')->nullable();
            $table->text('smtp_password')->nullable();
            $table->timestamp('last_error_at')->nullable();
            $table->string('last_error')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'user_id', 'email'], 'outreach_mailboxes_org_user_email');
            $table->index(['organization_id', 'user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_mailboxes');
    }
};
