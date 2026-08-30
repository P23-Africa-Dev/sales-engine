<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    protected $fillable = [
        'organization_id',
        'name',
        'trading_name',
        'normalized_name',
        'sector',
        'location',
        'country_code',
        'website',
        'email',
        'phone',
        'source',
        'source_provider',
        'external_id',
        'business_fields',
        'commercial_signals',
        'icp_fit_score',
        'intent_score',
        'priority_score',
        'summary',
        'last_enriched_at',
    ];

    protected function casts(): array
    {
        return [
            'business_fields' => 'array',
            'commercial_signals' => 'array',
            'icp_fit_score' => 'float',
            'intent_score' => 'float',
            'priority_score' => 'float',
            'last_enriched_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(CompanyContact::class);
    }

    public function signals(): HasMany
    {
        return $this->hasMany(LeadSignal::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public static function normalizeName(string $name): string
    {
        $n = mb_strtolower(trim($name));
        $n = preg_replace('/\b(ltd|limited|llc|inc|corp|plc|co)\b\.?/u', '', $n) ?? $n;
        $n = preg_replace('/[^a-z0-9\s]/u', '', $n) ?? $n;

        return trim(preg_replace('/\s+/', ' ', $n) ?? $n);
    }
}
