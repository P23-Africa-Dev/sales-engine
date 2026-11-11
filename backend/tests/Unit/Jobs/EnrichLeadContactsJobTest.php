<?php

namespace Tests\Unit\Jobs;

use App\Jobs\EnrichLeadContactsJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\Lead;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EnrichLeadContactsJobTest extends TestCase
{
    public function test_writes_found_contacts_into_lead_meta_and_chat_payload(): void
    {
        $this->disablePaidAndSearchProviders();
        [$user, $org] = $this->actingAsOrgMember();

        $found = $this->createLead($org, 'Acme Widgets', ['website' => 'https://acme.com', 'location' => 'United States']);
        $missing = $this->createLead($org, 'Nowhere Ltd', []);
        $session = ChatSession::query()->create(['organization_id' => $org->id, 'user_id' => $user->id, 'title' => 'Leads']);
        $message = ChatMessage::query()->create([
            'chat_session_id' => $session->id,
            'role' => 'assistant',
            'body' => 'Here are leads',
            'leads' => [
                ['id' => $found->id, 'name' => 'Acme Widgets', 'email' => null, 'contact_status' => 'not_attempted'],
                ['id' => $missing->id, 'name' => 'Nowhere Ltd', 'contact_status' => 'not_attempted'],
            ],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://acme.com/robots.txt' => Http::response('', 404),
            'https://acme.com/' => Http::response(
                '<html><body><a href="mailto:sales@acme.com">Sales</a><p>Call: (415) 555-0100</p></body></html>',
                200,
                ['Content-Type' => 'text/html'],
            ),
        ]);

        (new EnrichLeadContactsJob($org->id, [$found->id, $missing->id], $message->id))->handle();

        $foundMeta = $found->fresh()->meta;
        $this->assertSame('sales@acme.com', $foundMeta['email']);
        $this->assertSame('+14155550100', $foundMeta['phone']);
        $this->assertSame('found', $foundMeta['contact_status']);
        $this->assertTrue($foundMeta['contact_ready']);
        $this->assertSame('website_crawl', $foundMeta['contact_sources']['email']['method']);
        $this->assertSame('generic', $foundMeta['contact_sources']['email']['type']);
        $this->assertSame('company_line', $foundMeta['contact_sources']['phone']['type']);

        $this->assertSame('not_found', $missing->fresh()->meta['contact_status']);

        $payload = collect($message->fresh()->leads)->keyBy('id');
        $this->assertSame('sales@acme.com', $payload[$found->id]['email']);
        $this->assertSame('found', $payload[$found->id]['contact_status']);
        $this->assertSame('Acme Widgets', $payload[$found->id]['name']);
        $this->assertSame('not_found', $payload[$missing->id]['contact_status']);
    }

    public function test_ignores_leads_and_messages_from_another_organization(): void
    {
        $this->disablePaidAndSearchProviders();
        [$user, $org] = $this->actingAsOrgMember();
        [$otherUser, $otherOrg] = $this->createUserWithOrg();

        $foreignLead = $this->createLead($otherOrg, 'Foreign Co', []);
        $foreignSession = ChatSession::query()->create(['organization_id' => $otherOrg->id, 'user_id' => $otherUser->id, 'title' => 'Other']);
        $foreignMessage = ChatMessage::query()->create([
            'chat_session_id' => $foreignSession->id,
            'role' => 'assistant',
            'body' => 'x',
            'leads' => [['id' => $foreignLead->id, 'contact_status' => 'not_attempted']],
        ]);

        Http::preventStrayRequests();
        Http::fake();

        (new EnrichLeadContactsJob($org->id, [$foreignLead->id], $foreignMessage->id))->handle();

        $this->assertArrayNotHasKey('contact_status', $foreignLead->fresh()->meta);
        $this->assertSame('not_attempted', $foreignMessage->fresh()->leads[0]['contact_status']);
        Http::assertNothingSent();
    }

    public function test_runs_on_enrichment_queue(): void
    {
        $job = new EnrichLeadContactsJob(1, [3, 3, 4]);

        $this->assertSame('enrichment', $job->queue);
        $this->assertSame([3, 4], $job->leadIds);
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function createLead(Organization $org, string $name, array $meta): Lead
    {
        return Lead::query()->create([
            'organization_id' => $org->id,
            'name' => $name,
            'source' => 'serper',
            'score' => 50,
            'meta' => array_merge(['entity_type' => 'company', 'lead_type' => 'business'], $meta),
        ]);
    }

    private function disablePaidAndSearchProviders(): void
    {
        config([
            'services.contact_finder.concurrency_driver' => 'sync',
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);
    }
}
