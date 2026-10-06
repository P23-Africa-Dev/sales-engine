<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CrmActivity extends Model
{
    use HasFactory;

    protected $fillable = ['organization_id', 'lead_id', 'created_by_user_id', 'type', 'title', 'description', 'happened_at', 'meta'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'happened_at' => 'datetime'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
