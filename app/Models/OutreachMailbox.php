<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutreachMailbox extends Model
{
    protected $fillable = [
        'organization_id',
        'user_id',
        'provider',
        'email',
        'status',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'scopes',
        'provider_metadata',
        'smtp_host',
        'smtp_port',
        'smtp_encryption',
        'smtp_username',
        'smtp_password',
        'last_error_at',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'smtp_password' => 'encrypted',
            'token_expires_at' => 'datetime',
            'scopes' => 'array',
            'provider_metadata' => 'array',
            'last_error_at' => 'datetime',
            'smtp_port' => 'integer',
        ];
    }

    public function isConnected(): bool
    {
        return $this->status === 'connected';
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
