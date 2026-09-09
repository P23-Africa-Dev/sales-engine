<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_domain_authentications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('domain');
            $table->string('subdomain', 64)->nullable();
            $table->string('sendgrid_domain_id')->nullable();
            $table->string('from_email')->nullable();
            $table->string('from_name')->nullable();
            $table->json('dns_records')->nullable();
            $table->boolean('valid')->default(false);
            $table->string('verification_status', 32)->default('pending'); // pending|verified|failed
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_domain_authentications');
    }
};
