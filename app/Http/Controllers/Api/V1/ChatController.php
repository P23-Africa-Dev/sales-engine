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
        ]);

        $session = $this->chat->createSession(
            OrgContext::require(),
            $request->user(),
            $data['title'] ?? null,
        );

        return response()->json([
            'data' => [
                'id' => $session->id,
                'title' => $session->title,
                'icp_profile_id' => $session->icp_profile_id,
                'created_at' => $session->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function currentSession(Request $request): JsonResponse
    {
        $session = $this->chat->latestSessionForUser(
            OrgContext::require(),
            $request->user(),
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
            'intent' => ['nullable', 'string', 'in:freeform,quick_research,generate_leads,create_outreach'],
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

        return response()->json([
            'data' => [
                'user_message' => new ChatMessageResource($result['user_message']),
                'assistant_message' => new ChatMessageResource($result['assistant_message']),
                'discovery_run_id' => $result['discovery_run_id'],
            ],
        ]);
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
