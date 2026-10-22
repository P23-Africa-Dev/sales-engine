<?php

namespace App\Services\Auth;

use App\Mail\OrganizationInvitationMail;
use App\Models\Organization;
use App\Models\OrganizationInvitation;
use App\Models\OrganizationUser;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InvitationService
{
    /**
     * @return array{invitation: OrganizationInvitation, token: string}
     */
    public function create(Organization $organization, User $inviter, string $email, string $role): array
    {
        $email = mb_strtolower(trim($email));
        $token = Str::random(48);

        $invitation = OrganizationInvitation::query()->create([
            'organization_id' => $organization->id,
            'email' => $email,
            'role' => $role,
            'token_hash' => hash('sha256', $token),
            'invited_by_user_id' => $inviter->id,
            'expires_at' => now()->addDays(7),
        ]);

        $invitation->load('organization');
        Mail::to($email)->queue((new OrganizationInvitationMail($invitation, $token))->afterCommit());

        return ['invitation' => $invitation, 'token' => $token];
    }

    public function resend(OrganizationInvitation $invitation): OrganizationInvitation
    {
        $token = Str::random(48);
        $invitation->update([
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(7),
            'revoked_at' => null,
        ]);
        $invitation->load('organization');
        Mail::to($invitation->email)->queue((new OrganizationInvitationMail($invitation, $token))->afterCommit());

        return $invitation;
    }

    public function findOpen(string $token): OrganizationInvitation
    {
        $invitation = OrganizationInvitation::query()
            ->with('organization')
            ->where('token_hash', hash('sha256', $token))
            ->first();

        if (! $invitation || ! $invitation->isOpen()) {
            throw ValidationException::withMessages([
                'token' => ['This invitation is invalid or has expired.'],
            ]);
        }

        return $invitation;
    }

    /**
     * @return array{user: User, organization: Organization, token: string}
     */
    public function accept(string $token, string $name, string $password): array
    {
        $invitation = $this->findOpen($token);

        return DB::transaction(function () use ($invitation, $name, $password) {
            $user = User::query()->where('email', $invitation->email)->first();
            if ($user) {
                if (! Hash::check($password, $user->password)) {
                    throw ValidationException::withMessages([
                        'email' => ['An account with this email already exists. Sign in with the current password to accept the invite.'],
                    ]);
                }
            } else {
                $user = User::query()->create([
                    'name' => $name,
                    'email' => $invitation->email,
                    'password' => $password,
                    'email_verified_at' => now(),
                ]);
            }

            $membership = OrganizationUser::query()
                ->where('organization_id', $invitation->organization_id)
                ->where('user_id', $user->id)
                ->first();

            if (! $membership) {
                OrganizationUser::query()->create([
                    'organization_id' => $invitation->organization_id,
                    'user_id' => $user->id,
                    'role' => $invitation->role,
                ]);
            }

            $invitation->update(['accepted_at' => now()]);

            return [
                'user' => $user->fresh(),
                'organization' => $invitation->organization,
                'token' => $user->createToken('api')->plainTextToken,
            ];
        });
    }
}
