<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignalTypeDefinition extends Model
{
    public const PACK_DEFAULT = 'default';

    public const PACK_SOFTWARE_DEV = 'software_dev_vertical';

    public const PACK_LAGOS_CORPORATE_TRANSPORT = 'lagos_corporate_transport';

    /** Events that matter when the account needs a SUPPLIER (new supply, export readiness). */
    public const PACK_SUPPLY = 'supply_sourcing';

    /** Events that matter when the account needs FUNDING (new funds, open calls). */
    public const PACK_FUNDING = 'funding_opportunities';

    /** Manufacturers expanding abroad: trade fairs, local plants and assembly. */
    public const PACK_MANUFACTURING = 'manufacturing_export';

    /** Explicit opt-out: Social Listening skips discrete type queries. */
    public const PACK_NONE = 'none';

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
        'target_roles',
        'search_phrases',
    ];

    protected function casts(): array
    {
        return [
            'feeds_enrichment' => 'boolean',
            'default_recency_window_days' => 'integer',
            'active' => 'boolean',
            'target_roles' => 'array',
            'search_phrases' => 'array',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
