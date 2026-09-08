<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SocialSignal extends Model
{
    public const STATUSES = ['new', 'reviewed', 'outreached', 'synced', 'dismissed'];

    protected $fillable = [
        'organization_id',
        'icp_profile_id',
        'social_listening_run_id',
        'lead_id',
        'post_url',
        'content_hash',
        'platform',
        'source_label',
        'source_icon',
        'post_text',
        'summary',
        'posted_at',
        'profile_name',
        'author_profile_url',
        'persona',
        'company_name',
        'entity_type',
        'industry',
        'key_topics',
        'competitors',
        'follow_up_strategy',
        'location_text',
        'intent_label',
        'intent_color',
        'intent_description',
        'signal_type',
        'buying_stage',
        'problem',
        'urgency',
        'score',
        'reasons',
        'suggested_message',
        'recommended_action',
        'recommended_action_title',
        'recommended_action_detail',
        'why_this_matters_to_you',
        'benefits',
        'personal_recommended_action_title',
        'personal_recommended_action_detail',
        'status',
        'f23_lead_id',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'posted_at' => 'datetime',
            'score' => 'float',
            'reasons' => 'array',
            'key_topics' => 'array',
            'competitors' => 'array',
            'benefits' => 'array',
            'meta' => 'array',
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

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(SignalReminder::class);
    }
}
