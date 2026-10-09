<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachSendQuota extends Model
{
    protected $fillable = [
        'organization_id',
        'sender_type',
        'quota_date',
        'sent_count',
    ];

    protected function casts(): array
    {
        return [
            'quota_date' => 'date',
            'sent_count' => 'integer',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
