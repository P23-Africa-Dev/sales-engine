<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyContact extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'title',
        'email',
        'phone',
        'linkedin_url',
        'whatsapp_opt_in',
        'whatsapp_opt_in_at',
        'linkedin_last_verified_at',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'whatsapp_opt_in' => 'boolean',
            'whatsapp_opt_in_at' => 'datetime',
            'linkedin_last_verified_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
