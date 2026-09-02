<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SocialListeningSetting extends Model
{
    public const DEFAULT_SOURCES = [
        'linkedin_public',
        'x_mentions',
        'reddit',
        'meta_pages',
    ];

    public const DEFAULT_INTENT_FILTERS = [
        'recommendation',
        'switching',
        'pricing',
        'hiring_expansion',
    ];

    protected $fillable = [
        'organization_id',
        'icp_profile_id',
        'enabled_sources',
        'cadence_days',
        'min_score',
        'intent_filters',
        'crm_destination',
        'outreach_channel_default',
        'sender_mode',
        'org_verified_from_email',
        'org_verified_domain',
        'verification_status',
        'last_run_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled_sources' => 'array',
            'intent_filters' => 'array',
            'last_run_at' => 'datetime',
        ];
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function icpProfile(): BelongsTo
    {
        return $this->belongsTo(IcpProfile::class);
    }

    public static function defaultsForOrg(int $organizationId, ?int $icpProfileId = null): array
    {
        return [
            'organization_id' => $organizationId,
            'icp_profile_id' => $icpProfileId,
            'enabled_sources' => self::DEFAULT_SOURCES,
            'cadence_days' => 14,
            'min_score' => 55,
            'intent_filters' => self::DEFAULT_INTENT_FILTERS,
            'crm_destination' => 'qualified_pipeline',
            'outreach_channel_default' => 'email',
            'sender_mode' => 'platform',
            'verification_status' => 'pending',
        ];
    }
}
