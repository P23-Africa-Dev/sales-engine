<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrganizationResource;
use App\Http\Resources\UserResource;
use App\Models\OrganizationInvitation;
use App\Models\OrganizationUser;
use App\Models\User;
use App\Services\Auth\InvitationService;
use App\Support\OrgContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rules\Password;

class OrganizationMemberController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function index(): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('view', $org);

        $members = OrganizationUser::query()
            ->where('organization_id', $org->id)
            ->with('user')
            ->orderBy('id')
            ->get()
            ->map(fn (OrganizationUser $membership) => [
                'id' => $membership->user_id,
                'name' => $membership->user?->name,
                'email' => $membership->user?->email,
                'role' => $membership->role,
                'joined_at' => $membership->created_at?->toIso8601String(),
            ]);

        return response()->json(['data' => $members]);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $data = $request->validate([
            'role' => ['required', 'in:owner,admin,member'],
        ]);

        $membership = $this->membership($org->id, $userId);
        $this->assertCanChangeRole($request->user(), $org->id, $membership, $data['role']);
        $membership->update(['role' => $data['role']]);

        return response()->json(['data' => ['id' => $userId, 'role' => $membership->role]]);
    }

    public function destroy(Request $request, int $userId): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $membership = $this->membership($org->id, $userId);
        $this->assertCanRemove($request->user(), $org->id, $membership);
        $membership->delete();
        User::query()->find($userId)?->tokens()->delete();

        return response()->json(['message' => 'Member removed.']);
    }

    public function invitations(): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $rows = OrganizationInvitation::query()
            ->where('organization_id', $org->id)
            ->latest()
            ->get()
            ->map(fn (OrganizationInvitation $invitation) => $this->invitationPayload($invitation));

        return response()->json(['data' => $rows]);
    }

    public function invite(Request $request): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'role' => ['required', 'in:admin,member'],
        ]);

        $result = $this->invitations->create($org, $request->user(), $data['email'], $data['role']);

        return response()->json(['data' => $this->invitationPayload($result['invitation'])], 201);
    }

    public function revokeInvitation(int $id): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $invitation = OrganizationInvitation::query()
            ->where('organization_id', $org->id)
            ->findOrFail($id);
        $invitation->update(['revoked_at' => now()]);

        return response()->json(['message' => 'Invitation revoked.']);
    }

    public function resendInvitation(int $id): JsonResponse
    {
        $org = OrgContext::require();
        Gate::authorize('manage', $org);

        $invitation = OrganizationInvitation::query()
            ->where('organization_id', $org->id)
            ->findOrFail($id);
        $this->invitations->resend($invitation);

        return response()->json(['message' => 'Invitation resent.']);
    }

    public function previewInvitation(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string']]);
        $invitation = $this->invitations->findOpen($data['token']);

        return response()->json([
            'data' => [
                'email' => $invitation->email,
                'organization' => [
                    'id' => $invitation->organization_id,
                    'name' => $invitation->organization->name,
                ],
                'role' => $invitation->role,
                'expires_at' => $invitation->expires_at->toIso8601String(),
            ],
        ]);
    }

    public function acceptInvitation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'confirmed', Password::defaults()],
        ]);

        $result = $this->invitations->accept($data['token'], $data['name'], $data['password']);

        return response()->json([
            'token' => $result['token'],
            'token_type' => 'Bearer',
            'user' => new UserResource($result['user']),
            'organization' => new OrganizationResource($result['organization']),
        ]);
    }

    private function membership(int $organizationId, int $userId): OrganizationUser
    {
        return OrganizationUser::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $userId)
            ->firstOrFail();
    }

    private function assertCanChangeRole(User $actor, int $organizationId, OrganizationUser $membership, string $newRole): void
    {
        $actorRole = $this->actorRole($actor, $organizationId);
        if ($membership->role === 'owner' && $actorRole !== 'owner') {
            abort(403, 'Only an owner can change another owner.');
        }
        if ($newRole === 'owner' && $actorRole !== 'owner') {
            abort(403, 'Only an owner can assign the owner role.');
        }
        if ($membership->role === 'owner' && $newRole !== 'owner' && $this->ownerCount($organizationId) <= 1) {
            abort(422, 'The organization must keep at least one owner.');
        }
    }

    private function assertCanRemove(User $actor, int $organizationId, OrganizationUser $membership): void
    {
        $actorRole = $this->actorRole($actor, $organizationId);
        if ($membership->role === 'owner') {
            if ($actorRole !== 'owner') {
                abort(403, 'Only an owner can remove an owner.');
            }
            if ($this->ownerCount($organizationId) <= 1) {
                abort(422, 'The organization must keep at least one owner.');
            }
        }
    }

    private function actorRole(User $actor, int $organizationId): ?string
    {
        return OrganizationUser::query()
            ->where('organization_id', $organizationId)
            ->where('user_id', $actor->id)
            ->value('role');
    }

    private function ownerCount(int $organizationId): int
    {
        return OrganizationUser::query()
            ->where('organization_id', $organizationId)
            ->where('role', 'owner')
            ->count();
    }

    /**
     * @return array<string, mixed>
     */
    private function invitationPayload(OrganizationInvitation $invitation): array
    {
        return [
            'id' => $invitation->id,
            'email' => $invitation->email,
            'role' => $invitation->role,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
            'accepted_at' => $invitation->accepted_at?->toIso8601String(),
            'revoked_at' => $invitation->revoked_at?->toIso8601String(),
        ];
    }
}
