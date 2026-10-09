<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('trading_name')->nullable();
            $table->string('normalized_name')->index();
            $table->string('sector')->nullable()->index();
            $table->string('location')->nullable()->index();
            $table->string('country_code', 8)->nullable()->index();
            $table->string('website')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('source', 64)->default('web'); // web|registry|enrichment|field
            $table->string('source_provider', 64)->nullable();
            $table->string('external_id')->nullable();
            $table->json('business_fields')->nullable();
            $table->json('commercial_signals')->nullable();
            $table->decimal('icp_fit_score', 5, 2)->nullable();
            $table->decimal('intent_score', 5, 2)->nullable();
            $table->decimal('priority_score', 5, 2)->nullable()->index();
            $table->text('summary')->nullable();
            $table->timestamp('last_enriched_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'normalized_name', 'location'], 'companies_org_name_loc_unique');
        });

        Schema::create('company_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('title')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('linkedin_url')->nullable();
            $table->boolean('whatsapp_opt_in')->default(false);
            $table->timestamp('whatsapp_opt_in_at')->nullable();
            $table->timestamp('linkedin_last_verified_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        Schema::create('lead_signals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('signal_type', 64);
            $table->decimal('confidence', 5, 2)->nullable();
            $table->decimal('score', 5, 2)->nullable();
            $table->string('source', 64)->nullable();
            $table->string('url')->nullable();
            $table->text('snippet')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('detected_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'company_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_signals');
        Schema::dropIfExists('company_contacts');
        Schema::dropIfExists('companies');
    }
};
