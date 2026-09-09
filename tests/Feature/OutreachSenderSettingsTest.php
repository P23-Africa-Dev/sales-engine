<?php

namespace Tests\Feature;

use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use Tests\TestCase;

class OutreachSenderSettingsTest extends TestCase
{
    public function test_sender_settings_reports_not_connected_when_no_domain(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/outreach/sender-settings')
            ->assertOk()
            ->assertJsonPath('data.sender_mode', 'platform')
            ->assertJsonPath('data.org_connection_status', 'not_connected')
            ->assertJsonPath('data.verification_status', 'pending');
    }

    public function test_sender_settings_reports_pending_when_domain_awaiting_dns(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'sendgrid_domain_id' => '99',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'pending',
            'dns_records' => [],
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/outreach/sender-settings')
            ->assertOk()
            ->assertJsonPath('data.org_connection_status', 'pending')
            ->assertJsonPath('data.org_verified_domain', 'acme.test')
            ->assertJsonPath('data.org_verified_from_email', 'sales@acme.test');
    }

    public function test_cannot_switch_to_organization_until_verified(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'sendgrid_domain_id' => '99',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'pending',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/outreach/sender-settings', [
                'sender_mode' => 'organization',
            ])
            ->assertStatus(422);
    }

    public function test_can_switch_to_organization_when_verified(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'sendgrid_domain_id' => '99',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'verified',
            'valid' => true,
            'verified_at' => now(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/outreach/sender-settings', [
                'sender_mode' => 'organization',
            ])
            ->assertOk()
            ->assertJsonPath('data.sender_mode', 'organization')
            ->assertJsonPath('data.org_connection_status', 'verified');

        $this->assertDatabaseHas('outreach_identities', [
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
        ]);
    }
}
