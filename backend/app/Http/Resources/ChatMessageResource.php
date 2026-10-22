<?php

namespace App\Http\Resources;

use App\Models\ChatMessage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ChatMessage */
class ChatMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'role' => $this->role,
            'body' => $this->body,
            'intent' => $this->intent,
            'leads' => $this->leads,
            'meta' => $this->meta,
            'feedback_rating' => $this->feedback_rating,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
