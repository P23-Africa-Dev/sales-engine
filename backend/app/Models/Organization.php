<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'country',
        'team_size',
        'purpose',
        'user_type',
        'onboarding_completed_at',
        'search_limit_monthly',
        'outreach_email_limit_monthly',
        'enrichment_limit_monthly',
        'f23_company_id',
        'factory23_crm_sync_enabled',
        'f23_api_token',
        'f23_api_token_verified_at',
    ];

    protected function casts(): array
    {
        return [
            'factory23_crm_sync_enabled' => 'boolean',
            'f23_api_token' => 'encrypted',
            'f23_api_token_verified_at' => 'datetime',
            'onboarding_completed_at' => 'datetime',
            'search_limit_monthly' => 'integer',
            'outreach_email_limit_monthly' => 'integer',
            'enrichment_limit_monthly' => 'integer',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'organization_users')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(OrganizationUser::class);
    }

    public function icpProfiles(): HasMany
    {
        return $this->hasMany(IcpProfile::class);
    }

    public function activeIcpProfile()
    {
        return $this->hasOne(IcpProfile::class)->where('is_active', true);
    }

    public function companies(): HasMany
    {
        return $this->hasMany(Company::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }

    public function chatSessions(): HasMany
    {
        return $this->hasMany(ChatSession::class);
    }
}
