<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InboundEmail extends Model
{
    protected $fillable = [
        'organization_id',
        'outreach_activity_id',
        'lead_id',
        'from_email',
        'to_email',
        'subject',
        'body_text',
        'body_html',
        'received_at',
        'raw_headers',
    ];

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
            'raw_headers' => 'array',
        ];
    }

    public function activity(): BelongsTo
    {
        return $this->belongsTo(OutreachActivity::class, 'outreach_activity_id');
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
