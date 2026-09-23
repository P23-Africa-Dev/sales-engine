<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachDomainAuthentication extends Model
{
    protected $fillable = [
        'organization_id',
        'domain',
        'subdomain',
        'sendgrid_domain_id',
        'from_email',
        'from_name',
        'dns_records',
        'valid',
        'verification_status',
        'integrity_status',
        'integrity_checks',
        'integrity_checked_at',
        'warmup_started_at',
        'verified_at',
        'last_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'dns_records' => 'array',
            'integrity_checks' => 'array',
            'valid' => 'boolean',
            'verified_at' => 'datetime',
            'last_checked_at' => 'datetime',
            'integrity_checked_at' => 'datetime',
            'warmup_started_at' => 'datetime',
        ];
    }

    public function isVerified(): bool
    {
        return $this->verification_status === 'verified' && filled($this->from_email);
    }

    public function passesIntegrity(): bool
    {
        return in_array($this->integrity_status, ['pass', 'warn'], true);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
