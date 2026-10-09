<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EnrichmentLog extends Model
{
    protected $fillable = [
        'organization_id',
        'lead_id',
        'social_signal_id',
        'person_name',
        'person_index',
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
            'person_index' => 'integer',
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

    public function socialSignal(): BelongsTo
    {
        return $this->belongsTo(SocialSignal::class);
    }
}
