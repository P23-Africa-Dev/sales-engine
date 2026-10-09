<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IcpProfile extends Model
{
    protected $fillable = [
        'organization_id',
        'name',
        'description',
        'is_active',
        'lead_count',
        'config',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'config' => 'array',
            'lead_count' => 'integer',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public static function defaultConfig(): array
    {
        return [
            'profileName' => '',
            'description' => '',
            'industries' => [],
            'companySizes' => [],
            'revenueRanges' => [],
            'territories' => [],
            'decisionMakers' => [],
            'minMatchScore' => 60,
            'autoSyncCrm' => false,
            'enrichContactDetails' => true,
            'customPrompt' => '',
            'searchKeywords' => [],
            'signalTypePacks' => ['default'],
        ];
    }
}
