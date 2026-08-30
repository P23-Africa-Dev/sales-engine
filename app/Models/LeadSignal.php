<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadSignal extends Model
{
    protected $fillable = [
        'organization_id',
        'company_id',
        'signal_type',
        'confidence',
        'score',
        'source',
        'url',
        'snippet',
        'meta',
        'detected_at',
    ];

    protected function casts(): array
    {
        return [
            'confidence' => 'float',
            'score' => 'float',
            'meta' => 'array',
            'detected_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
