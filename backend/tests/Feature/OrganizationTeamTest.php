<?php

namespace Tests\Feature;

use App\Mail\OrganizationInvitationMail;
use App\Models\OrganizationInvitation;
use App\Models\OrganizationUser;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class OrganizationTeamTest extends TestCase
{
    public function test_countries_are_public(): void
    {
        $this->getJson('/api/v1/countries')
            ->assertOk()
            ->assertJsonPath('data.countries.0.label', 'Nigeria')
            ->assertJsonPath('data.countries.0.value', 'NG');
    }

    public function test_owner_can_update_the_current_organization(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->patchJson('/api/v1/organizations/current', [
                'name' => 'Renamed Org',
                'country' => 'ng',
                'team_size' => '2-10',
                'purpose' => 'sales',
                'user_type' => 'founder',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed Org')
            ->assertJsonPath('data.country', 'NG')
            ->assertJsonPath('data.onboarding_completed', true);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('onboarding_completed', true)
            ->assertJsonPath('user.email', $user->email);
    }

    public function test_last_owner_cannot_be_removed(): void
    {
        [$owner, $org] = $this->actingAsOrgMember();
        $member = User::factory()->create();
        OrganizationUser::query()->create([
            'organization_id' => $org->id,
            'user_id' => $member->id,
            'role' => 'member',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->deleteJson('/api/v1/organizations/current/members/'.$owner->id)
            ->assertStatus(422);

        $this->withHeaders($this->orgHeaders($org))
            ->deleteJson('/api/v1/organizations/current/members/'.$member->id)
            ->assertOk();
    }

    public function test_invitation_can_be_previewed_and_accepted(): void
    {
        Mail::fake();
        [$owner, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/organizations/current/invitations', [
                'email' => 'teammate@example.com',
                'role' => 'member',
            ])
            ->assertCreated();

        Mail::assertQueued(OrganizationInvitationMail::class);
        $invitation = OrganizationInvitation::query()->first();
        $this->assertNotNull($invitation);

        $token = 'known-invite-token';
        $invitation->update(['token_hash' => hash('sha256', $token)]);

        $this->postJson('/api/v1/invitations/preview', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.email', 'teammate@example.com')
            ->assertJsonPath('data.organization.name', $org->name);

        $this->postJson('/api/v1/invitations/accept', [
            'token' => $token,
            'name' => 'Teammate',
            'password' => 'Password1!',
            'password_confirmation' => 'Password1!',
        ])->assertOk()->assertJsonPath('user.email', 'teammate@example.com')->assertJsonStructure(['token']);

        $this->assertNotNull($owner->id);
    }
}
