<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachInbox extends Model
{
    protected $fillable = [
        'organization_id',
        'email',
        'display_name',
        'status',
        'confirmation_code_hash',
        'confirmation_sent_at',
        'confirmed_at',
        'is_default',
    ];

    protected function casts(): array
    {
        return [
            'confirmation_sent_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'is_default' => 'boolean',
        ];
    }

    public function isConfirmed(): bool
    {
        return $this->status === 'confirmed';
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
