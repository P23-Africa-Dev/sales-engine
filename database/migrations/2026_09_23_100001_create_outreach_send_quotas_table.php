<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outreach_send_quotas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('sender_type', 32); // platform|organization|connected_mailbox
            $table->date('quota_date');
            $table->unsignedInteger('sent_count')->default(0);
            $table->timestamps();

            $table->unique(['organization_id', 'sender_type', 'quota_date'], 'outreach_send_quotas_org_type_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outreach_send_quotas');
    }
};
