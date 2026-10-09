<?php

namespace Tests\Feature;

use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachInbox;
use App\Models\OutreachSetupRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OutreachInboxTest extends TestCase
{
    public function test_cannot_add_inbox_without_domain(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/inboxes', ['email' => 'a@acme.test'])
            ->assertStatus(422);
    }

    public function test_confirm_inbox_with_code(): void
    {
        config(['services.sendgrid.api_key' => 'sg-test']);
        Http::fake([
            'api.sendgrid.com/*' => Http::response('', 202, ['X-Message-Id' => 'confirm-1']),
        ]);

        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
        ]);

        $create = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/inboxes', ['email' => 'sales@acme.test'])
            ->assertCreated()
            ->json('data');

        $inbox = OutreachInbox::query()->findOrFail($create['id']);
        $this->assertSame('pending', $inbox->status);

        // Bypass hash by setting a known code.
        $inbox->update([
            'confirmation_code_hash' => Hash::make('123456'),
            'confirmation_sent_at' => now(),
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/inboxes/' . $inbox->id . '/confirm', ['code' => '123456'])
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');
    }

    public function test_support_request_creates_open_row(): void
    {
        [$user, $org] = $this->actingAsOrgMember();

        OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'acme.test',
            'from_email' => 'sales@acme.test',
            'verification_status' => 'failed',
            'integrity_status' => 'fail',
            'integrity_checks' => [
                ['key' => 'dmarc', 'label' => 'DMARC', 'status' => 'fail', 'message' => 'missing'],
            ],
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/outreach/setup-request', [
                'note' => 'Please help with DNS',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'open');

        $this->assertDatabaseHas('outreach_setup_requests', [
            'organization_id' => $org->id,
            'status' => 'open',
            'domain' => 'acme.test',
        ]);

        $this->assertSame(1, OutreachSetupRequest::query()->where('organization_id', $org->id)->count());
    }
}
