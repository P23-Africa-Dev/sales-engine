<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachSetupRequest extends Model
{
    protected $fillable = [
        'organization_id',
        'user_id',
        'domain',
        'note',
        'status',
        'failing_checks',
    ];

    protected function casts(): array
    {
        return [
            'failing_checks' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
