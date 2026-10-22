<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\InboundEmail;
use App\Models\OutreachActivity;
use App\Services\Outreach\InboundReplyAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SendGridInboundController extends Controller
{
    public function __construct(private readonly InboundReplyAddress $addresses) {}

    public function handle(Request $request): JsonResponse
    {
        $expected = trim((string) config('services.sendgrid.inbound_secret'));
        $provided = (string) ($request->query('token') ?: $request->header('X-Inbound-Token'));
        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Invalid inbound secret.'], 401);
        }

        $to = (string) ($request->input('to') ?: $request->input('envelope.to') ?: '');
        $activityId = $this->addresses->activityIdFromRecipient($to);
        $activity = $activityId ? OutreachActivity::query()->find($activityId) : null;

        if (! $activity) {
            return response()->json(['ok' => true]);
        }

        InboundEmail::query()->create([
            'organization_id' => $activity->organization_id,
            'outreach_activity_id' => $activity->id,
            'lead_id' => $activity->lead_id,
            'from_email' => (string) $request->input('from', ''),
            'to_email' => $to,
            'subject' => $request->input('subject'),
            'body_text' => $request->input('text'),
            'body_html' => $request->input('html'),
            'received_at' => now(),
            'raw_headers' => ['headers' => $request->input('headers')],
        ]);

        $activity->update([
            'meta' => array_merge($activity->meta ?? [], ['replied_at' => now()->toIso8601String()]),
        ]);

        return response()->json(['ok' => true]);
    }
}
