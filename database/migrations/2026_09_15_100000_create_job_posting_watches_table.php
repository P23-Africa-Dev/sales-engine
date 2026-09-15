<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_posting_watches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('posting_key', 64);
            $table->string('source_url', 500);
            $table->string('company_name')->nullable();
            $table->string('role_title')->nullable();
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamps();

            $table->unique(['organization_id', 'posting_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_posting_watches');
    }
};
