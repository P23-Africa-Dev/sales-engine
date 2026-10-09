<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InfobipSmsWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $expected = trim((string) config('services.infobip.webhook_token'));
        $provided = (string) ($request->query('token') ?: $request->header('X-Infobip-Token'));
        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Invalid webhook token.'], 401);
        }

        $results = $request->input('results', []);
        if (! is_array($results)) {
            return response()->json(['ok' => true]);
        }

        foreach ($results as $event) {
            if (! is_array($event)) {
                continue;
            }
            $this->applyEvent($event);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function applyEvent(array $event): void
    {
        $messageId = isset($event['messageId']) ? (string) $event['messageId'] : '';
        $callback = isset($event['callbackData']) ? (string) $event['callbackData'] : '';
        $activity = null;

        if (str_starts_with($callback, 'activity:')) {
            $activity = OutreachActivity::query()->find((int) substr($callback, 9));
        }

        if (! $activity && $messageId !== '') {
            $activity = OutreachActivity::query()
                ->where('meta->provider_message_id', $messageId)
                ->first();
        }

        $group = strtoupper((string) data_get($event, 'status.groupName', ''));
        $statusName = strtoupper((string) data_get($event, 'status.name', ''));
        $errorName = strtoupper((string) data_get($event, 'error.name', ''));
        $description = (string) data_get($event, 'status.description', data_get($event, 'error.description', ''));

        $delivery = match ($group) {
            'DELIVERED' => 'delivered',
            'PENDING' => 'queued',
            'UNDELIVERABLE', 'EXPIRED' => 'bounced',
            'REJECTED' => 'dropped',
            default => null,
        };

        if ($activity && $delivery) {
            $activity->update([
                'delivery_status' => $delivery,
                'last_event_at' => now(),
                'bounce_reason' => in_array($delivery, ['bounced', 'dropped'], true)
                    ? mb_substr($description !== '' ? $description : $statusName, 0, 500)
                    : $activity->bounce_reason,
            ]);
        }

        $optOut = str_contains($errorName, 'STOP')
            || str_contains($errorName, 'UNSUBSCRIBE')
            || str_contains(strtoupper($description), 'STOP')
            || str_contains(strtoupper($description), 'UNSUBSCRIBE');

        if ($optOut) {
            $phone = isset($event['to']) ? (string) $event['to'] : ($activity?->to_phone ?? '');
            if ($phone !== '' && ! str_starts_with($phone, '+')) {
                $phone = '+'.$phone;
            }
            if ($phone !== '') {
                OutreachSuppression::query()->updateOrCreate(
                    [
                        'organization_id' => $activity?->organization_id,
                        'email' => 'sms:'.$phone,
                        'reason' => 'unsubscribe',
                    ],
                    [
                        'phone' => $phone,
                        'suppressed_at' => now(),
                    ]
                );
            }
        }
    }
}
