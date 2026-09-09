<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enrichment_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->string('person_name')->nullable();
            $table->string('tier', 16); // tier1, tier2, tier3
            $table->string('provider', 64);
            $table->boolean('found_email')->default(false);
            $table->boolean('found_phone')->default(false);
            $table->unsignedInteger('credits_used')->default(0);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'provider']);
            $table->index(['organization_id', 'tier', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enrichment_logs');
    }
};
