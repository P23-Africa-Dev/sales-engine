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
        'f23_company_id',
        'factory23_crm_sync_enabled',
    ];

    protected function casts(): array
    {
        return [
            'factory23_crm_sync_enabled' => 'boolean',
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
