<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachSuppression extends Model
{
    protected $fillable = [
        'organization_id',
        'email',
        'reason',
        'sendgrid_event_id',
        'suppressed_at',
    ];

    protected function casts(): array
    {
        return [
            'suppressed_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
