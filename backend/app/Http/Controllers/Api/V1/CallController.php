<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Voice\VoiceCallService;
use App\Services\Voice\VoiceNotConfiguredException;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CallController extends Controller
{
    public function __construct(private readonly VoiceCallService $voice) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'to_number' => ['required', 'string', 'max:32'],
            'lead_id' => ['nullable', 'integer'],
        ]);

        try {
            $call = $this->voice->clickToCall(
                OrgContext::require(),
                $request->user(),
                $data['to_number'],
                isset($data['lead_id']) ? (int) $data['lead_id'] : null,
            );
        } catch (VoiceNotConfiguredException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'voice_not_configured',
            ], 422);
        }

        return response()->json(['data' => [
            'id' => $call->id,
            'status' => $call->status,
            'direction' => $call->direction,
            'to_number' => $call->to_number,
        ]], 201);
    }
}
