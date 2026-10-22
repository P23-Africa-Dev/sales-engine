<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChatMessage extends Model
{
    protected $fillable = [
        'chat_session_id',
        'role',
        'body',
        'intent',
        'leads',
        'meta',
        'feedback_rating',
        'feedback_comment',
        'feedback_at',
    ];

    protected function casts(): array
    {
        return [
            'leads' => 'array',
            'meta' => 'array',
            'feedback_at' => 'datetime',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'chat_session_id');
    }
}
