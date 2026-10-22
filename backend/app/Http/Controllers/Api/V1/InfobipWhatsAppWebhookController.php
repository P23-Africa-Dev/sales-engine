<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InfobipWhatsAppWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $expected = trim((string) config('services.infobip.whatsapp_webhook_token'));
        $provided = (string) ($request->query('token') ?: $request->header('X-Infobip-Token'));
        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Invalid webhook token.'], 401);
        }

        $results = $request->input('results', $request->input('messages', []));
        if (! is_array($results)) {
            return response()->json(['ok' => true]);
        }

        foreach ($results as $event) {
            if (! is_array($event)) {
                continue;
            }
            $this->apply($event);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function apply(array $event): void
    {
        $messageId = (string) ($event['messageId'] ?? $event['message_id'] ?? '');
        $from = (string) ($event['from'] ?? '');
        $inbound = isset($event['message']) || (($event['direction'] ?? null) === 'inbound');

        $activity = null;
        if ($messageId !== '') {
            $activity = OutreachActivity::query()->where('meta->provider_message_id', $messageId)->first();
        }

        if ($inbound && $from !== '') {
            $phone = str_starts_with($from, '+') ? $from : '+'.$from;
            $existing = OutreachActivity::query()
                ->where('to_phone', $phone)
                ->where('channel', 'whatsapp')
                ->latest('id')
                ->first();

            if ($existing) {
                $existing->update([
                    'delivery_status' => 'inbound',
                    'last_event_at' => now(),
                    'meta' => array_merge($existing->meta ?? [], ['whatsapp_inbound_at' => now()->toIso8601String()]),
                ]);
            }

            return;
        }

        if ($activity) {
            $status = strtolower((string) ($event['status']['groupName'] ?? $event['status'] ?? ''));
            if ($status !== '') {
                $activity->update([
                    'delivery_status' => $status,
                    'last_event_at' => now(),
                ]);
            }
        }
    }
}
