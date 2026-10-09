<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('f23_company_id')->nullable()->index();
            $table->boolean('factory23_crm_sync_enabled')->default(false);
            $table->timestamps();
        });

        Schema::create('organization_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 32)->default('owner'); // owner|admin|member
            $table->timestamps();
            $table->unique(['organization_id', 'user_id']);
            $table->index(['user_id', 'organization_id']);
        });

        Schema::create('external_identities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 64); // factory23
            $table->string('external_user_id');
            $table->string('external_company_id')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'external_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_identities');
        Schema::dropIfExists('organization_users');
        Schema::dropIfExists('organizations');
    }
};
