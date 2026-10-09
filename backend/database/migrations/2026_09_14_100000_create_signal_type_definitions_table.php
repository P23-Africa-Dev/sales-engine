<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signal_type_definitions', function (Blueprint $table) {
            $table->id();
            // null organization_id = global/system default, available to every org.
            $table->foreignId('organization_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('key', 64);
            $table->string('label', 128);
            $table->text('trigger_description');
            $table->text('example_valid')->nullable();
            $table->text('example_invalid')->nullable();
            $table->string('pack', 64)->default('default'); // e.g. 'default', 'software_dev_vertical', 'lagos_corporate_transport'
            $table->boolean('feeds_enrichment')->default(false);
            $table->unsignedSmallInteger('default_recency_window_days')->default(180);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['organization_id', 'key']);
            $table->index(['pack', 'active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signal_type_definitions');
    }
};
