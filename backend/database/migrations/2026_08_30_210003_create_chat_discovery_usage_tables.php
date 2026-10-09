<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('icp_profile_id')->nullable()->constrained('icp_profiles')->nullOnDelete();
            $table->string('title')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'user_id']);
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_session_id')->constrained()->cascadeOnDelete();
            $table->string('role', 16); // user|assistant
            $table->longText('body');
            $table->string('intent', 32)->nullable();
            $table->json('leads')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        Schema::create('discovery_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('icp_profile_id')->nullable()->constrained('icp_profiles')->nullOnDelete();
            $table->foreignId('chat_session_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 32)->default('pending'); // pending|running|completed|failed
            $table->string('query')->nullable();
            $table->string('intent', 32)->nullable();
            $table->json('stages')->nullable();
            $table->json('result_summary')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('api_usage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 64);
            $table->string('endpoint', 128)->nullable();
            $table->unsignedInteger('units')->default(1);
            $table->decimal('estimated_cost', 10, 6)->default(0);
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'provider', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_usage');
        Schema::dropIfExists('discovery_runs');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_sessions');
    }
};
