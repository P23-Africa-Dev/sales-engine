<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OutreachActivity;
use App\Models\OutreachSuppression;
use App\Models\OutreachWebhookEvent;
use App\Services\Outreach\SendGridWebhookVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SendGridWebhookController extends Controller
{
    /**
     * Event types that indicate the recipient can no longer be safely emailed.
     */
    private const SUPPRESSING_EVENTS = ['bounce', 'dropped', 'spamreport', 'unsubscribe', 'group_unsubscribe'];

    public function __construct(private readonly SendGridWebhookVerifier $verifier) {}

    public function handle(Request $request): JsonResponse
    {
        $rawBody = $request->getContent();

        if ($this->verifier->isConfigured()) {
            $signature = (string) $request->header('X-Twilio-Email-Event-Webhook-Signature', '');
            $timestamp = (string) $request->header('X-Twilio-Email-Event-Webhook-Timestamp', '');

            if (! $this->verifier->verify($rawBody, $signature, $timestamp)) {
                Log::warning('SendGrid webhook signature verification failed.');

                return response()->json(['message' => 'Invalid signature.'], 403);
            }
        }

        $events = json_decode($rawBody, true);
        if (! is_array($events)) {
            return response()->json(['message' => 'Invalid payload.'], 400);
        }

        foreach ($events as $event) {
            if (is_array($event)) {
                $this->processEvent($event);
            }
        }

        // Always ack quickly with 200 — SendGrid retries aggressively on non-2xx.
        return response()->json(['ok' => true]);
    }

    private function processEvent(array $event): void
    {
        $sgEventId = (string) ($event['sg_event_id'] ?? '');
        if ($sgEventId === '' || OutreachWebhookEvent::query()->where('sg_event_id', $sgEventId)->exists()) {
            return;
        }

        $eventType = (string) ($event['event'] ?? '');
        $email = mb_strtolower(trim((string) ($event['email'] ?? '')));
        $organizationId = isset($event['organization_id']) ? (int) $event['organization_id'] : null;
        $activityId = isset($event['activity_id']) ? (int) $event['activity_id'] : null;
        $occurredAt = isset($event['timestamp']) ? now()->setTimestamp((int) $event['timestamp']) : now();

        OutreachWebhookEvent::query()->create([
            'sg_event_id' => $sgEventId,
            'event_type' => $eventType,
            'email' => $email !== '' ? $email : null,
            'sg_message_id' => $event['sg_message_id'] ?? null,
            'organization_id' => $organizationId,
            'outreach_activity_id' => $activityId,
            'raw_payload' => $event,
            'occurred_at' => $occurredAt,
        ]);

        $activity = $activityId ? OutreachActivity::query()->find($activityId) : null;

        if ($activity) {
            $activity->update([
                'delivery_status' => $this->mapDeliveryStatus($eventType, $activity->delivery_status),
                'last_event_at' => $occurredAt,
                'bounce_reason' => in_array($eventType, ['bounce', 'dropped'], true)
                    ? (string) ($event['reason'] ?? $event['response'] ?? null)
                    : $activity->bounce_reason,
            ]);
        }

        if (in_array($eventType, self::SUPPRESSING_EVENTS, true) && $email !== '') {
            OutreachSuppression::query()->updateOrCreate(
                [
                    'organization_id' => $organizationId,
                    'email' => $email,
                    'reason' => $eventType,
                ],
                [
                    'sendgrid_event_id' => $sgEventId,
                    'suppressed_at' => $occurredAt,
                ]
            );
        }
    }

    private function mapDeliveryStatus(string $eventType, ?string $current): string
    {
        // Don't let a lower-priority later event (e.g. a delayed "open" retry)
        // downgrade a terminal negative status.
        $terminalNegative = ['bounced', 'dropped', 'spam', 'unsubscribed'];
        if (in_array($current, $terminalNegative, true)) {
            return $current;
        }

        return match ($eventType) {
            'delivered' => 'delivered',
            'open' => 'opened',
            'click' => 'clicked',
            'bounce' => 'bounced',
            'dropped' => 'dropped',
            'spamreport' => 'spam',
            'unsubscribe', 'group_unsubscribe' => 'unsubscribed',
            default => $current ?? 'sent',
        };
    }
}
