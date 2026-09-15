<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignalTypeDefinition extends Model
{
    public const PACK_DEFAULT = 'default';

    public const PACK_SOFTWARE_DEV = 'software_dev_vertical';

    public const PACK_LAGOS_CORPORATE_TRANSPORT = 'lagos_corporate_transport';

    protected $fillable = [
        'organization_id',
        'key',
        'label',
        'trigger_description',
        'example_valid',
        'example_invalid',
        'pack',
        'feeds_enrichment',
        'default_recency_window_days',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'feeds_enrichment' => 'boolean',
            'default_recency_window_days' => 'integer',
            'active' => 'boolean',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
