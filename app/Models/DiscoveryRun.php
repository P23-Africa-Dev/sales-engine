<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscoveryRun extends Model
{
    protected $fillable = [
        'organization_id',
        'user_id',
        'icp_profile_id',
        'chat_session_id',
        'status',
        'query',
        'intent',
        'stages',
        'result_summary',
        'error',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'stages' => 'array',
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
}
