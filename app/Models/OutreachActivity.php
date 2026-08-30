<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachActivity extends Model
{
    protected $fillable = [
        'organization_id',
        'lead_id',
        'company_id',
        'name',
        'channel',
        'preview',
        'accent_bg',
        'accent_icon',
        'occurred_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
