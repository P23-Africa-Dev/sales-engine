<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CompanyContact;
use App\Models\OutreachActivity;
use App\Services\Icp\IcpProfileService;
use App\Services\Outreach\OutreachDraftService;
use App\Services\Outreach\OutreachSendService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class OutreachController extends Controller
{
    public function __construct(
        private readonly OutreachDraftService $outreach,
        private readonly OutreachSendService $sendService,
        private readonly IcpProfileService $icps,
    ) {}

    public function recent(): JsonResponse
    {
        $items = OutreachActivity::query()
            ->where('organization_id', OrgContext::require()->id)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn(OutreachActivity $a) => [
                'id' => $a->id,
                'name' => $a->name,
                'channel' => $a->channel,
                'preview' => $a->preview,
                'accentBg' => $a->accent_bg,
                'accentIcon' => $a->accent_icon,
                'occurred_at' => $a->occurred_at?->toIso8601String(),
                'delivery_status' => $a->delivery_status ?? (filled($a->sent_at) ? 'sent' : null),
                'last_event_at' => $a->last_event_at?->toIso8601String(),
                'bounce_reason' => $a->bounce_reason,
            ]);

        return response()->json(['data' => $items]);
    }

    public function draft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:5000'],
            'channel' => ['nullable', 'string', 'in:email,whatsapp'],
            'contact_id' => ['nullable', 'integer'],
            'send' => ['nullable', 'boolean'],
            'to_email' => ['nullable', 'email'],
            'inbox_id' => ['nullable', 'integer'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Active ICP required.'], 422);
        }

        if (! empty($data['send']) && ($data['channel'] ?? '') === 'whatsapp') {
            $contact = null;
            if (! empty($data['contact_id'])) {
                $contact = CompanyContact::query()->find($data['contact_id']);
            }
            try {
                $this->outreach->assertCanSendWhatsApp($contact);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $prompt = $data['prompt'];
        if (($data['channel'] ?? null) === 'whatsapp' && ! str_contains(mb_strtolower($prompt), 'whatsapp')) {
            $prompt = 'whatsapp: ' . $prompt;
        }

        $draft = $this->outreach->draftFromPrompt($org, $icp, $prompt);

        if (! empty($data['send']) && ($data['channel'] ?? 'email') === 'email') {
            $user = $request->user();
            if (! $user) {
                return response()->json(['message' => 'Authenticated user required to send email.'], 401);
            }
            $toEmail = $data['to_email'] ?? null;
            if (! $toEmail) {
                return response()->json(['message' => 'to_email is required when send=true.'], 422);
            }

            $primaryActivity = null;
            $activityIds = $draft['activity_ids'] ?? [];
            if ($activityIds !== []) {
                $primaryActivity = OutreachActivity::query()
                    ->where('organization_id', $org->id)
                    ->find($activityIds[0]);
            }

            try {
                $result = $this->sendService->queueEmail(
                    $org,
                    $user,
                    $toEmail,
                    (string) ($draft['subject'] ?? 'Outreach'),
                    $draft['body'],
                    $primaryActivity,
                    isset($data['inbox_id']) ? (int) $data['inbox_id'] : null,
                );
            } catch (\Throwable $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json(['data' => array_merge($draft, [
                'sent' => false,
                'queued' => true,
                'delivery_status' => $result['delivery_status'] ?? 'queued',
            ])]);
        }

        return response()->json(['data' => $draft]);
    }

    public function show(int $id): JsonResponse
    {
        $org = OrgContext::require();

        $activity = OutreachActivity::query()
            ->where('organization_id', $org->id)
            ->with('lead')
            ->find($id);

        if (! $activity) {
            return response()->json(['message' => 'Outreach draft not found.'], 404);
        }

        return response()->json(['data' => $this->outreach->activityToDraftPayload($activity)]);
    }

    public function regenerate(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'instructions' => ['nullable', 'string', 'max:1000'],
            'channel' => ['nullable', 'string', 'in:email,whatsapp'],
        ]);

        $org = OrgContext::require();
        $icp = $this->icps->active($org);
        if (! $icp) {
            return response()->json(['message' => 'Active ICP required.'], 422);
        }

        $activity = OutreachActivity::query()
            ->where('organization_id', $org->id)
            ->find($id);

        if (! $activity) {
            return response()->json(['message' => 'Outreach draft not found.'], 404);
        }

        try {
            $draft = $this->outreach->regenerate(
                $activity,
                $org,
                $icp,
                $data['instructions'] ?? null,
                $data['channel'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $draft]);
    }

    /**
     * Send an already-drafted outreach activity (from chat's create_outreach
     * intent or the social-listening outreach draft) to a chosen recipient,
     * sending exactly the subject/body the user reviewed.
     */
    public function sendActivity(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'to_email' => ['required', 'email'],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:20000'],
            'inbox_id' => ['nullable', 'integer'],
        ]);

        $org = OrgContext::require();
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Authenticated user required to send email.'], 401);
        }

        $activity = OutreachActivity::query()
            ->where('organization_id', $org->id)
            ->find($id);

        if (! $activity) {
            return response()->json(['message' => 'Outreach draft not found.'], 404);
        }

        try {
            $result = $this->sendService->queueEmail(
                $org,
                $user,
                $data['to_email'],
                (string) ($data['subject'] ?? 'Outreach'),
                $data['body'],
                $activity,
                isset($data['inbox_id']) ? (int) $data['inbox_id'] : null,
            );
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => array_merge($result, ['activity_id' => $activity->id])]);
    }

    public function destroy(int $id): JsonResponse
    {
        $org = OrgContext::require();

        $activity = OutreachActivity::query()
            ->where('organization_id', $org->id)
            ->find($id);

        if (! $activity) {
            return response()->json(['message' => 'Outreach activity not found.'], 404);
        }

        $activity->delete();

        return response()->json(['data' => ['deleted' => true, 'id' => $id]]);
    }
}
