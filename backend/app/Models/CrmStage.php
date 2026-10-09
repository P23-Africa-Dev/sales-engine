<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CrmStage extends Model
{
    use HasFactory;

    protected $fillable = ['organization_id', 'name', 'slug', 'color', 'sort_order', 'is_default'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'sort_order' => 'integer'];
    }
}
