<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ChatMessageResource;
use App\Models\ChatSession;
use App\Services\Chat\ChatService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class ChatController extends Controller
{
    public function __construct(private readonly ChatService $chat) {}

    public function storeSession(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'icp_profile_id' => ['nullable', 'integer'],
        ]);

        $org = OrgContext::require();
        $icpProfileId = isset($data['icp_profile_id']) ? (int) $data['icp_profile_id'] : null;

        if ($icpProfileId) {
            $icp = \App\Models\IcpProfile::query()
                ->where('organization_id', $org->id)
                ->where('id', $icpProfileId)
                ->firstOrFail();
            $session = $this->chat->resolveOrCreateSessionForIcp($org, $request->user(), $icp);
        } else {
            $session = $this->chat->createSession(
                $org,
                $request->user(),
                $data['title'] ?? null,
            );
        }

        return response()->json([
            'data' => [
                'id' => $session->id,
                'title' => $session->title,
                'icp_profile_id' => $session->icp_profile_id,
                'created_at' => $session->created_at?->toIso8601String(),
            ],
        ], $session->wasRecentlyCreated ? 201 : 200);
    }

    public function currentSession(Request $request): JsonResponse
    {
        $data = $request->validate([
            'icp_profile_id' => ['nullable', 'integer'],
        ]);

        $session = $this->chat->latestSessionForUser(
            OrgContext::require(),
            $request->user(),
            isset($data['icp_profile_id']) ? (int) $data['icp_profile_id'] : null,
        );

        if (! $session) {
            return response()->json(['data' => null]);
        }

        return response()->json([
            'data' => [
                'id' => $session->id,
                'title' => $session->title,
                'icp_profile_id' => $session->icp_profile_id,
                'created_at' => $session->created_at?->toIso8601String(),
                'updated_at' => $session->updated_at?->toIso8601String(),
            ],
        ]);
    }

    public function clearMessages(int $id): JsonResponse
    {
        $session = $this->ownedSession($id);
        $this->chat->clearSessionMessages($session);

        return response()->json(['data' => ['cleared' => true]]);
    }

    public function messages(int $id): JsonResponse
    {
        $session = $this->ownedSession($id);
        $messages = $session->messages()->orderBy('id')->get();

        return response()->json([
            'data' => ChatMessageResource::collection($messages),
        ]);
    }

    public function postMessage(Request $request, int $id): JsonResponse
    {
        $session = $this->ownedSession($id);
        $data = $request->validate([
            'body' => ['required', 'string', 'max:10000'],
            'intent' => ['nullable', 'string', 'in:freeform,quick_research,generate_leads,generate_more_leads,create_outreach'],
            'timezone' => ['nullable', 'string', 'max:64'],
        ]);

        try {
            $result = $this->chat->postMessage(
                $session,
                OrgContext::require(),
                $request->user(),
                $data['body'],
                $data['intent'] ?? 'freeform',
                $data['timezone'] ?? null,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $payload = [
            'user_message' => new ChatMessageResource($result['user_message']),
            'discovery_run_id' => $result['discovery_run_id'] ?? null,
            'status' => $result['status'] ?? 'completed',
        ];

        if (! empty($result['assistant_message'])) {
            $payload['assistant_message'] = new ChatMessageResource($result['assistant_message']);
        }

        $statusCode = ($result['status'] ?? 'completed') === 'processing' ? 202 : 200;

        return response()->json(['data' => $payload], $statusCode);
    }

    private function ownedSession(int $id): ChatSession
    {
        return ChatSession::query()
            ->where('organization_id', OrgContext::require()->id)
            ->where('user_id', request()->user()->id)
            ->where('id', $id)
            ->firstOrFail();
    }
}
