<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CallLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InfobipVoiceWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $expected = trim((string) config('services.infobip.voice_webhook_token'));
        $provided = (string) ($request->query('token') ?: $request->header('X-Infobip-Token'));
        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Invalid webhook token.'], 401);
        }

        $callId = (string) ($request->input('callId') ?: $request->input('id') ?: '');
        if ($callId === '') {
            return response()->json(['ok' => true]);
        }

        $call = CallLog::query()->where('provider_call_id', $callId)->first();
        if (! $call) {
            return response()->json(['ok' => true]);
        }

        $direction = strtolower((string) $request->input('direction', $call->direction));
        $call->update([
            'status' => (string) ($request->input('status') ?: $call->status),
            'direction' => in_array($direction, ['inbound', 'outbound'], true) ? $direction : $call->direction,
            'duration_seconds' => $request->input('duration') !== null ? (int) $request->input('duration') : $call->duration_seconds,
            'recording_url' => $request->input('recordingUrl') ?: $call->recording_url,
            'ended_at' => now(),
        ]);

        return response()->json(['ok' => true]);
    }
}
