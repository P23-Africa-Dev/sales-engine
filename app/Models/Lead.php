<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lead extends Model
{
    public const STAGES = ['new', 'contacted', 'engaged', 'qualified', 'won', 'lost'];

    protected $fillable = [
        'organization_id',
        'company_id',
        'icp_profile_id',
        'name',
        'source',
        'score',
        'summary',
        'stage',
        'f23_lead_id',
        'synced_to_f23_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'float',
            'meta' => 'array',
            'synced_to_f23_at' => 'datetime',
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

    public function icpProfile(): BelongsTo
    {
        return $this->belongsTo(IcpProfile::class);
    }

    public function outreachActivities(): HasMany
    {
        return $this->hasMany(OutreachActivity::class);
    }
}
