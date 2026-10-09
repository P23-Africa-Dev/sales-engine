<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmEntry extends Model
{
    use HasFactory;

    protected $fillable = ['organization_id', 'lead_id', 'pipeline_id', 'stage_id', 'created_by_user_id', 'assigned_to_user_id', 'identity_key', 'priority', 'budget_amount', 'budget_currency', 'details'];

    protected function casts(): array
    {
        return ['details' => 'array', 'budget_amount' => 'float'];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(CrmPipeline::class);
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(CrmStage::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }
}
