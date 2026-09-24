<?php

namespace Tests\Feature;

use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachInbox;
use Tests\TestCase;

class OutreachSenderSettingsTest extends TestCase
{
    public function test_sender_settings_reports_not_connected_when_no_domain(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/outreach/sender-settings')
            ->assertOk()
            ->assertJsonPath('data.org_connection_status', 'not_connected')
            ->assertJsonPath('data.setup.can_send', false);
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
            ->assertJsonPath('data.setup.can_send', false);
    }

    public function test_setup_can_send_when_domain_and_inbox_ready(): void
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
            'integrity_status' => 'pass',
            'integrity_checks' => [
                ['key' => 'sendgrid_auth', 'label' => 'SendGrid', 'status' => 'pass', 'message' => 'ok'],
            ],
        ]);

        OutreachInbox::query()->create([
            'organization_id' => $org->id,
            'email' => 'sales@acme.test',
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'is_default' => true,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->getJson('/api/v1/outreach/sender-settings')
            ->assertOk()
            ->assertJsonPath('data.org_connection_status', 'verified')
            ->assertJsonPath('data.setup.can_send', true)
            ->assertJsonPath('data.default_inbox.email', 'sales@acme.test');
    }

    public function test_cannot_set_default_inbox_when_not_confirmed(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'sendgrid_domain_id' => '99',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
        ]);

        $inbox = OutreachInbox::query()->create([
            'organization_id' => $org->id,
            'email' => 'sales@acme.test',
            'status' => 'pending',
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->putJson('/api/v1/outreach/sender-settings', [
                'default_inbox_id' => $inbox->id,
            ])
            ->assertStatus(422);
    }
}
