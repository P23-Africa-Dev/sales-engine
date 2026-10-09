<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('icp_profile_id')->nullable()->constrained('icp_profiles')->nullOnDelete();
            $table->string('name');
            $table->string('source', 64)->nullable();
            $table->decimal('score', 5, 2)->nullable();
            $table->text('summary')->nullable();
            $table->string('stage', 32)->default('new'); // new|contacted|engaged|qualified|won|lost
            $table->string('f23_lead_id')->nullable()->index();
            $table->timestamp('synced_to_f23_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'stage']);
        });

        Schema::create('outreach_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('channel', 64);
            $table->text('preview')->nullable();
            $table->string('accent_bg', 32)->nullable();
            $table->string('accent_icon', 32)->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_activities');
        Schema::dropIfExists('leads');
    }
};
