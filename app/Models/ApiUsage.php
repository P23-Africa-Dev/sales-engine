<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApiUsage extends Model
{
    protected $table = 'api_usage';

    protected $fillable = [
        'organization_id',
        'provider',
        'endpoint',
        'units',
        'estimated_cost',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'units' => 'integer',
            'estimated_cost' => 'float',
            'meta' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
