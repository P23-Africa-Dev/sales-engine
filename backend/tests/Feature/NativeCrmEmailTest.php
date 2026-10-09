<?php

namespace Tests\Feature;

use App\Models\OutreachActivity;
use App\Services\Outreach\OutreachSendService;
use Illuminate\Support\Str;
use Tests\TestCase;

class NativeCrmEmailTest extends TestCase
{
    public function test_email_history_is_scoped_to_native_lead_and_organization(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads', ['name' => 'Ada'])->json('data.lead.id');
        OutreachActivity::query()->create(['organization_id' => $org->id, 'lead_id' => $id, 'name' => 'Introduction', 'channel' => 'email', 'subject' => 'Hello Ada']);

        $this->getJson('/api/v1/crm/leads/'.$id.'/emails')->assertOk()->assertJsonPath('data.items.0.subject', 'Hello Ada')->assertJsonPath('data.inbound_supported', false);
        $this->getJson('/api/v1/crm/leads/999999/emails')->assertNotFound();
    }

    public function test_retry_of_same_composed_email_does_not_queue_twice(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads', ['name' => 'Ada'])->json('data.lead.id');
        $this->mock(OutreachSendService::class)->shouldReceive('queueEmail')->once()->andReturn(['queued' => true]);
        $payload = ['to_email' => 'ada@example.com', 'subject' => 'Hello', 'body' => 'Reviewed message', 'request_id' => (string) Str::uuid()];

        $first = $this->postJson('/api/v1/crm/leads/'.$id.'/emails', $payload)->assertCreated()->json('data.activity.id');
        $this->postJson('/api/v1/crm/leads/'.$id.'/emails', $payload)->assertCreated()->assertJsonPath('data.activity.id', $first);
        $this->assertDatabaseCount('outreach_activities', 1);
    }

    public function test_invalid_sender_rolls_back_activity_and_returns_actionable_error(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $id = $this->withHeaders($this->orgHeaders($org))->postJson('/api/v1/crm/leads', ['name' => 'Ada'])->json('data.lead.id');
        $this->mock(OutreachSendService::class)->shouldReceive('queueEmail')->once()->andThrow(new \InvalidArgumentException('Verify your sender first.'));

        $this->postJson('/api/v1/crm/leads/'.$id.'/emails', ['to_email' => 'ada@example.com', 'subject' => 'Hello', 'body' => 'Reviewed message', 'request_id' => (string) Str::uuid()])->assertUnprocessable()->assertJsonValidationErrors('sender');
        $this->assertDatabaseCount('outreach_activities', 0);
    }
}
