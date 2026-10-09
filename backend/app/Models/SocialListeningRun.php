<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SocialListeningRun extends Model
{
    protected $fillable = [
        'organization_id',
        'icp_profile_id',
        'user_id',
        'status',
        'stages',
        'signals_created',
        'result_summary',
        'error',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'stages' => 'array',
            // Structured since the Stage 1/2 pipeline rebuild (see
            // docs/backend_implementation_plan.md Phase 6). Runs created before
            // that ship a plain human-readable string in this column; json_decode
            // of a non-JSON string returns null, so old runs simply read back as
            // `result_summary: null` here — consistent with how every other
            // legacy field in this rebuild degrades gracefully.
            'result_summary' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
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

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function signals(): HasMany
    {
        return $this->hasMany(SocialSignal::class);
    }
}
