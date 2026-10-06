<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_pipelines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('currency_code', 3)->default('USD');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->unique(['organization_id', 'name']);
        });
        Schema::create('crm_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug', 64);
            $table->string('color', 7);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->unique(['organization_id', 'slug']);
        });
        Schema::create('crm_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lead_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('pipeline_id')->constrained('crm_pipelines')->restrictOnDelete();
            $table->foreignId('stage_id')->constrained('crm_stages')->restrictOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('identity_key', 512)->nullable();
            $table->string('priority', 16)->default('medium');
            $table->decimal('budget_amount', 16, 2)->nullable();
            $table->string('budget_currency', 3)->nullable();
            $table->json('details')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'pipeline_id', 'stage_id']);
            $table->index(['organization_id', 'identity_key']);
        });
        Schema::create('crm_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pipeline_id')->constrained('crm_pipelines')->cascadeOnDelete();
            $table->unique(['organization_id', 'user_id']);
        });
        foreach (['crm_notes', 'crm_activities'] as $name) {
            Schema::create($name, function (Blueprint $table) use ($name) {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
                $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                if ($name === 'crm_notes') {
                    $table->text('note');
                } else {
                    $table->string('type', 64);
                    $table->string('title')->nullable();
                    $table->text('description')->nullable();
                    $table->timestamp('happened_at')->nullable();
                    $table->json('meta')->nullable();
                }
                $table->timestamps();
                $table->index(['organization_id', 'lead_id']);
            });
        }
        // Only externally confirmed CRM records qualify for the initial backfill.
        DB::table('organizations')->orderBy('id')->each(function ($org) {
            $now = now();
            $pipeline = DB::table('crm_pipelines')->insertGetId(['organization_id' => $org->id, 'name' => 'Default Pipeline', 'is_default' => true, 'created_at' => $now, 'updated_at' => $now]);
            $stages = [];
            foreach (['new' => ['New Lead', '#2563EB'], 'contacted' => ['Contacted', '#E879A0'], 'engaged' => ['Engaged', '#F59E0B'], 'qualified' => ['Qualified', '#10B981'], 'won' => ['Won', '#059669'], 'lost' => ['Lost', '#EF4444']] as $slug => [$label, $color]) {
                $stages[$slug] = DB::table('crm_stages')->insertGetId(['organization_id' => $org->id, 'name' => $label, 'slug' => $slug, 'color' => $color, 'sort_order' => count($stages), 'is_default' => $slug === 'new', 'created_at' => $now, 'updated_at' => $now]);
            }
            DB::table('leads')->where('organization_id', $org->id)->whereNotNull('synced_to_f23_at')->orderBy('id')->each(function ($lead) use ($org, $pipeline, $stages) {
                DB::table('crm_entries')->insert(['organization_id' => $org->id, 'lead_id' => $lead->id, 'pipeline_id' => $pipeline, 'stage_id' => $stages[$lead->stage] ?? $stages['new'], 'created_at' => $lead->synced_to_f23_at, 'updated_at' => $lead->updated_at]);
            });
        });
    }

    public function down(): void
    {
        foreach (['crm_activities', 'crm_notes', 'crm_preferences', 'crm_entries', 'crm_stages', 'crm_pipelines'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
