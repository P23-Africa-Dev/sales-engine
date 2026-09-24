<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Outreach\OutreachInboxService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class OutreachInboxController extends Controller
{
    public function __construct(private readonly OutreachInboxService $inboxes) {}

    public function index(): JsonResponse
    {
        $org = OrgContext::require();
        $items = $this->inboxes->list($org)->map(fn ($inbox) => $this->format($inbox));

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'display_name' => ['nullable', 'string', 'max:255'],
        ]);

        $org = OrgContext::require();

        try {
            $inbox = $this->inboxes->createAndSendConfirmation(
                $org,
                $data['email'],
                $data['display_name'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json([
            'data' => $this->format($inbox),
            'message' => 'Confirmation code sent to '.$inbox->email.'.',
        ], 201);
    }

    public function confirm(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
        ]);

        $org = OrgContext::require();

        try {
            $inbox = $this->inboxes->confirm($org, $id, $data['code']);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => $this->format($inbox),
            'message' => 'Inbox confirmed. You can send as '.$inbox->email.'.',
        ]);
    }

    public function resend(int $id): JsonResponse
    {
        $org = OrgContext::require();

        try {
            $inbox = $this->inboxes->resendConfirmation($org, $id);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json([
            'data' => $this->format($inbox),
            'message' => 'A new confirmation code was sent.',
        ]);
    }

    public function setDefault(int $id): JsonResponse
    {
        $org = OrgContext::require();

        try {
            $inbox = $this->inboxes->setDefault($org, $id);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $this->format($inbox)]);
    }

    public function destroy(int $id): JsonResponse
    {
        $org = OrgContext::require();
        $this->inboxes->destroy($org, $id);

        return response()->json(['data' => null]);
    }

    private function format(\App\Models\OutreachInbox $inbox): array
    {
        return [
            'id' => $inbox->id,
            'email' => $inbox->email,
            'display_name' => $inbox->display_name,
            'status' => $inbox->status,
            'is_default' => (bool) $inbox->is_default,
            'confirmed_at' => $inbox->confirmed_at?->toIso8601String(),
            'confirmation_sent_at' => $inbox->confirmation_sent_at?->toIso8601String(),
        ];
    }
}
