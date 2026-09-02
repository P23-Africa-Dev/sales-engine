<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignalReminder extends Model
{
    protected $fillable = [
        'organization_id',
        'social_signal_id',
        'user_id',
        'remind_at',
        'note',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'remind_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function signal(): BelongsTo
    {
        return $this->belongsTo(SocialSignal::class, 'social_signal_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
