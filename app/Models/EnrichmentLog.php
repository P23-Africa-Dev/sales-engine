<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EnrichmentLog extends Model
{
    protected $fillable = [
        'organization_id',
        'lead_id',
        'person_name',
        'tier',
        'provider',
        'found_email',
        'found_phone',
        'credits_used',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'found_email' => 'boolean',
            'found_phone' => 'boolean',
            'credits_used' => 'integer',
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
