<?php

namespace Tests\Feature;

use App\Jobs\EnrichLeadContactsJob;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\IcpProfile;
use App\Models\Lead;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class DiscoveryEntityModeTest extends TestCase
{
    private function fakeMixedSerper(): void
    {
        Http::fake(function ($request) {
            if (! str_contains($request->url(), 'google.serper.dev')) {
                return Http::response([], 200);
            }

            $organic = [];
            $people = ['Chinedu Okafor', 'Amaka Eze', 'Tunde Bakare', 'Ngozi Adeyemi', 'Ifeanyi Nwosu', 'Bola Ahmed', 'Kemi Adebayo', 'Emeka Obi'];
            for ($i = 1; $i <= 8; $i++) {
                $person = $people[$i - 1];
                $slug = strtolower(str_replace(' ', '-', $person));
                $organic[] = [
                    'title' => "{$person} - Chief Executive Officer - Payline{$i} | LinkedIn",
                    'link' => "https://ng.linkedin.com/in/{$slug}",
                    'snippet' => "Lagos, Nigeria · Chief Executive Officer at Payline{$i}, a fintech payments company.",
                ];
                $organic[] = [
                    'title' => "Payline{$i} Fintech | Payments for Nigerian merchants",
                    'link' => "https://payline{$i}.com.ng",
                    'snippet' => "Payline{$i} is a Lagos fintech payments company serving merchants in Nigeria.",
                ];
            }

            return Http::response(['organic' => $organic], 200);
        });
    }

    private function makeIcp(int $orgId, bool $enrichContacts = false): void
    {
        IcpProfile::query()->create([
            'organization_id' => $orgId,
            'name' => 'Lagos Fintech',
            'is_active' => true,
            'config' => array_merge(IcpProfile::defaultConfig(), [
                'industries' => ['Fintech'],
                'territories' => ['Nigeria'],
                'decisionMakers' => ['CEO'],
                'minMatchScore' => 1,
                'enrichContactDetails' => $enrichContacts,
            ]),
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.serper.api_key' => 'test-serper',
            'services.serper.base_url' => 'https://google.serper.dev',
            'services.glm.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);
    }

    public function test_companies_mode_never_returns_people_even_when_the_prompt_names_roles(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $this->makeIcp($org->id);
        $this->fakeMixedSerper();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'CEOs at fintech payment companies in Lagos',
                'intent' => 'generate_leads',
                'limit' => 6,
                'entity_mode' => 'companies',
            ])
            ->assertCreated();

        $leads = $response->json('data.leads') ?? [];
        $this->assertNotEmpty($leads);
        $this->assertSame([], array_values(array_filter($leads, fn (array $lead) => ($lead['entity_type'] ?? null) === 'person')));
        $this->assertNotContains('people_rescue_pass', $response->json('data.stages'));
    }

    public function test_both_mode_returns_an_interleaved_mix(): void
    {
        [, $org] = $this->actingAsOrgMember();
        $this->makeIcp($org->id);
        $this->fakeMixedSerper();

        $response = $this->withHeaders($this->orgHeaders($org))
            ->postJson('/api/v1/discovery/runs', [
                'query' => 'fintech payment companies in Lagos',
                'intent' => 'generate_leads',
                'limit' => 6,
                'entity_mode' => 'both',
            ])
            ->assertCreated();

        $types = array_map(fn (array $lead) => $lead['entity_type'] ?? null, $response->json('data.leads') ?? []);
        $this->assertContains('person', $types);
        $this->assertContains('company', $types);
        $this->assertNotSame($types[0], $types[1], 'Both mode should alternate person and company rows');
    }

    public function test_chat_results_are_shown_first_and_contacts_are_queued_as_searching(): void
    {
        Queue::fake([EnrichLeadContactsJob::class]);
        [$user, $org] = $this->actingAsOrgMember();
        $this->makeIcp($org->id, enrichContacts: true);
        $this->fakeMixedSerper();
        $icp = IcpProfile::query()->where('organization_id', $org->id)->firstOrFail();
        $session = ChatSession::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'icp_profile_id' => $icp->id,
        ]);

        $this->withHeaders($this->orgHeaders($org))
            ->postJson("/api/v1/chat/sessions/{$session->id}/messages", [
                'body' => 'fintech payment companies in Lagos',
                'intent' => 'generate_leads',
                'entity_mode' => 'companies',
                'count' => 4,
            ])
            ->assertSuccessful();

        $message = ChatMessage::query()->where('chat_session_id', $session->id)->where('role', 'assistant')->latest('id')->firstOrFail();
        $leads = $message->leads ?? [];
        $this->assertNotEmpty($leads);
        $searching = array_filter($leads, fn (array $lead) => ($lead['contact_status'] ?? null) === 'searching');
        $this->assertNotEmpty($searching);

        Queue::assertPushed(EnrichLeadContactsJob::class, function (EnrichLeadContactsJob $job) use ($message, $searching): bool {
            return $job->chatMessageId === $message->id
                && $job->leadIds === array_values(array_map(fn (array $lead) => (int) $lead['id'], $searching));
        });
        $lead = Lead::query()->findOrFail((int) array_values($searching)[0]['id']);
        $this->assertSame('searching', $lead->meta['contact_status']);
    }
}
