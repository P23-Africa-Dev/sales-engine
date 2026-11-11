<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\ContactEnrichmentOrchestrator;
use App\Services\Enrichment\ContactTextExtractor;
use App\Services\Enrichment\PhoneNumberNormalizer;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Wrong contact details are worse than none. Cases come from the live audit (11 Nov 2026).
 */
class ContactPrecisionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.glm.api_key' => '',
            'services.serper.api_key' => '',
            'services.bytemine.api_key' => '',
            'services.cleanlist.api_key' => '',
            'services.apollo.api_key' => '',
            'services.hunter.api_key' => '',
        ]);
        Http::fake();
    }

    /**
     * @param  list<array{title: string, snippet: string, url: string}>  $snippets
     * @param  array<string, mixed>  $seed
     * @return array<string, mixed>
     */
    private function enrich(string $person, array $seed, array $snippets): array
    {
        [, $org] = $this->actingAsOrgMember();

        return app(ContactEnrichmentOrchestrator::class)->enrichContacts($org, $person, $seed, $snippets);
    }

    public function test_placeholder_mailboxes_are_never_contacts(): void
    {
        $text = app(ContactTextExtractor::class);

        $this->assertNull($text->normalizeEmail('jdoe@selinawamucii.com'));
        $this->assertNull($text->normalizeEmail('name@company.co.ke'));
        $this->assertNull($text->normalizeEmail('youremail@acme.com'));
        $this->assertSame('jane.doe@acme.com', $text->normalizeEmail('jane.doe@acme.com'));
    }

    public function test_company_lead_rejects_another_companys_domain_and_webmail(): void
    {
        $result = $this->enrich('', ['company' => 'Exponential Impact', 'website' => 'https://exponentialimpact.com', 'location' => 'Nairobi, Kenya'], [[
            'title' => 'Exponential Impact',
            'snippet' => 'Contact info@capboard.io or takashi.oyagi@gmail.com for details.',
            'url' => 'https://capboard.io/exponential-impact',
        ]]);

        $this->assertSame('', $result['email']);
        $this->assertSame('', $result['company_email']);
    }

    public function test_person_webmail_is_kept_only_when_it_carries_their_name(): void
    {
        $kept = $this->enrich('Ronald Musundi', ['company' => 'AV Ventures', 'location' => 'Nairobi, Kenya'], [[
            'title' => 'Ronald Musundi',
            'snippet' => 'Reach me at ronmusundi@gmail.com',
            'url' => 'https://example.org/ronald',
        ]]);
        $this->assertSame('ronmusundi@gmail.com', $kept['email']);

        $dropped = $this->enrich('Simon Ndoria', ['company' => 'P4G', 'location' => 'Nairobi, Kenya'], [[
            'title' => 'Simon Ndoria',
            'snippet' => 'Contact the office at office.admin1@gmail.com',
            'url' => 'https://example.org/simon',
        ]]);
        $this->assertSame('', $dropped['email']);
    }

    public function test_truncated_phone_is_rejected(): void
    {
        $result = $this->enrich('Ronald Musundi', ['company' => 'AV Ventures', 'location' => 'Nairobi, Kenya', 'phone' => '+1 202-469'], []);

        $this->assertSame('', $result['phone']);
    }

    public function test_foreign_number_is_not_a_local_persons_phone(): void
    {
        $result = $this->enrich('Fuseini Nadi', ['company' => 'Bomarts Farms', 'location' => 'Accra, Ghana', 'phone' => '+62 821-3947-4255'], []);

        $this->assertSame('', $result['phone']);
    }

    public function test_local_number_is_kept_and_normalised(): void
    {
        $result = $this->enrich('Fuseini Nadi', ['company' => 'Bomarts Farms', 'location' => 'Accra, Ghana', 'phone' => '024 412 3456'], []);

        $this->assertSame('+233244123456', $result['phone']);
    }

    public function test_country_check_on_e164(): void
    {
        $phones = app(PhoneNumberNormalizer::class);

        $this->assertTrue($phones->belongsToCountry('+233244123456', 'GH'));
        $this->assertFalse($phones->belongsToCountry('+6563394100', 'GH'));
        $this->assertTrue($phones->belongsToCountry('+6563394100', null));
    }
}
