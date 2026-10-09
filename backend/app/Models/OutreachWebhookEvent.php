<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OutreachWebhookEvent extends Model
{
    protected $fillable = [
        'sg_event_id',
        'event_type',
        'email',
        'sg_message_id',
        'organization_id',
        'outreach_activity_id',
        'raw_payload',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'raw_payload' => 'array',
            'occurred_at' => 'datetime',
        ];
    }
}
