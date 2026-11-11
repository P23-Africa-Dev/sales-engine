<?php

namespace Tests\Unit\Extraction;

use App\Models\IcpProfile;
use App\Models\Organization;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Discovery\DTO\RawDiscoveryHit;
use App\Services\Discovery\QueryIntentService;
use App\Services\Extraction\ExtractionService;
use App\Services\Llm\GlmClient;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ExtractionServiceTest extends TestCase
{
    public function test_listicle_extraction_does_not_use_article_url_as_linkedin(): void
    {
        config(['services.glm.api_key' => '']);

        $service = new ExtractionService(
            new GlmClient,
            new QueryIntentService,
        );

        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'ICP',
                'is_active' => true,
                'config' => IcpProfile::defaultConfig(),
            ]),
            'top 10 wealthiest men',
        );

        $hit = new RawDiscoveryHit(
            name: 'Top 10 Richest People',
            snippet: '1. Elon Musk · 2. Larry Page · 3. Jeff Bezos',
            url: 'https://example.com/blog/top-10-richest-people',
            source: 'serper',
            provider: 'serper',
        );

        $people = $service->extractMany($hit, $brief, $org);

        $this->assertNotEmpty($people);
        foreach ($people as $person) {
            $this->assertNull($person['linkedin_url'] ?? null);
            $this->assertSame('', $person['summary'] ?? '');
        }
    }

    public function test_listicle_glm_extraction_rejects_shared_snippet_as_summary(): void
    {
        config([
            'services.glm.api_key' => 'test',
            'services.glm.base_url' => 'https://glm.example.com',
            'services.glm.extract_model' => 'glm-4-flash',
        ]);

        Http::fake([
            'glm.example.com/*' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => json_encode([
                            'people' => [[
                                'person_name' => 'Elon Musk',
                                'title' => 'CEO',
                                'company' => 'Tesla',
                                'summary' => '1. Elon Musk · 2. Larry Page',
                            ]],
                        ]),
                    ],
                ]],
            ], 200),
        ]);

        $service = app(ExtractionService::class);
        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'ICP',
                'is_active' => true,
                'config' => IcpProfile::defaultConfig(),
            ]),
            'top 10 wealthiest men',
        );

        $hit = new RawDiscoveryHit(
            name: 'Top 10 Richest People',
            snippet: '1. Elon Musk · 2. Larry Page',
            url: 'https://example.com/blog/top-10-richest',
            source: 'serper',
            provider: 'serper',
        );

        $people = $service->extractMany($hit, $brief, $org);

        $this->assertCount(1, $people);
        $this->assertSame('CEO', $people[0]['title']);
        $this->assertSame('Tesla', $people[0]['company']);
        $this->assertSame('', $people[0]['summary']);
        $this->assertNull($people[0]['linkedin_url'] ?? null);
    }

    public function test_company_fallback_does_not_fill_location_from_icp(): void
    {
        config(['services.glm.api_key' => '']);

        $service = new ExtractionService(
            new GlmClient,
            new QueryIntentService,
        );

        [, $org] = $this->actingAsOrgMember();
        $brief = IcpBrief::fromIcpProfile(
            IcpProfile::query()->create([
                'organization_id' => $org->id,
                'name' => 'NG ICP',
                'is_active' => true,
                'config' => array_merge(IcpProfile::defaultConfig(), [
                    'territories' => ['Nigeria'],
                    'customPrompt' => 'logistics 3PL',
                ]),
            ]),
            'give me prospects',
        );

        $hit = new RawDiscoveryHit(
            name: 'Northstar Freight Co',
            snippet: 'Nationwide freight directory listing.',
            url: 'https://example.com/northstar-freight',
            source: 'serper',
            provider: 'serper',
            location: null,
            sector: null,
        );

        $extracted = $service->extract($hit, $brief, $org);

        $this->assertNull($extracted['location'] ?? null);
    }

    /**
     * Shapes taken from live Serper results for "CEO fintech payment companies in Lagos site:linkedin.com/in".
     *
     * @return array<string, array{0: string, 1: string, 2: string, 3: string, 4: ?string, 5: ?string}>
     */
    public static function linkedInPeopleHits(): array
    {
        return [
            'title and company in snippet' => ['Bukola Akinsanya - SaySwitch Limited | LinkedIn', 'https://ng.linkedin.com/in/bukola-akinsanya', 'Bukola A. · Managing Director & CEO | SaySwitch Limited | Driving Payments Innovation', 'Bukola Akinsanya', 'Managing Director & CEO', 'SaySwitch Limited'],
            'slug without hyphen, caps headline' => ['GBOLAHAN FANIRAN - MinieMoney | LinkedIn', 'https://ng.linkedin.com/in/gbolahanfaniran', 'Founder/CEO MinieMoney. Fintech | Digital Banking | Lending', 'Gbolahan Faniran', 'Founder/CEO', 'MinieMoney'],
            'honorific and post-nominals' => ['Dr. Stanley Jacob FCIB - Zest Payments | LinkedIn', 'https://ng.linkedin.com/in/drstanleyjacob', 'Experience · Group Chief Innovation Officer · Founding CEO, Zest Payments Limited', 'Stanley Jacob', 'CEO', 'Zest Payments Limited'],
            'tagline is not a title' => ['Ope Adeoye - To grow, connect to the pipe | LinkedIn', 'https://ng.linkedin.com/in/opeadeoye', '20+ years in the technology & payments ecosystem.', 'Ope Adeoye', null, null],
            'handle slug with digits' => ['Luis Hidalgo - Head of Sales | Player-Coach Sales Leader | LinkedIn', 'https://uk.linkedin.com/in/hidalgo1', 'London · Head of Sales at Ethos', 'Luis Hidalgo', 'Head of Sales', null],
            'title at company with experience' => ['Gloria Adjei - Olam | LinkedIn', 'https://gh.linkedin.com/in/gloria-adjei-1a2b3c', 'Import Export Manager at Olam · Experience: Olam · Location: Accra.', 'Gloria Adjei', 'Import Export Manager', 'Olam'],
            'full company name kept' => ['Fuseini Nadi - Bomarts Farms | LinkedIn', 'https://gh.linkedin.com/in/fuseini-nadi', 'Export Manager at Bomarts Farms Limited · Experience: Bomarts Farms Limited · Location: Ghana', 'Fuseini Nadi', 'Export Manager', 'Bomarts Farms Limited'],
            'at-sign title with former name' => ['Eugene Gikonyo - Prosper Global Ventures | LinkedIn', 'https://ke.linkedin.com/in/eugene-gikonyo', 'Eugene Gikonyo · Principal @ Prosper Global Ventures (formerly Mercy Corps Ventures) | Impact', 'Eugene Gikonyo', 'Principal', 'Prosper Global Ventures'],
            'second role is not a company' => ['Olayemi Toye - CIO | LinkedIn', 'https://ng.linkedin.com/in/olayemi-toye', 'CIO | CTO | Payments', 'Olayemi Toye', 'CIO', null],
        ];
    }

    #[DataProvider('linkedInPeopleHits')]
    public function test_linkedin_people_hits_recover_name_title_and_company(string $title, string $url, string $snippet, string $name, ?string $role, ?string $company): void
    {
        config(['services.glm.api_key' => '']);
        $brief = IcpBrief::fromIcpProfile(new IcpProfile(['name' => 'X', 'config' => IcpProfile::defaultConfig()]), 'fintech in Lagos', 'people');
        $slugName = ucwords(str_replace('-', ' ', basename($url)));
        $hit = new RawDiscoveryHit(name: $slugName, source: 'web', provider: 'serper', snippet: $snippet, url: $url, meta: ['title' => $title]);
        $org = Organization::query()->create(['name' => 'O', 'slug' => 'o-'.uniqid()]);

        $row = app(ExtractionService::class)->extractManyBatch([$hit], $brief, $org)[0][0];

        $this->assertSame($name, $row['person_name']);
        $this->assertSame($role, $row['title'] ?? null);
        $this->assertSame($company, $row['company'] ?? null);
    }

    public function test_initials_only_names_are_dropped(): void
    {
        config(['services.glm.api_key' => '']);
        $brief = IcpBrief::fromIcpProfile(new IcpProfile(['name' => 'X', 'config' => IcpProfile::defaultConfig()]), 'fintech in Lagos', 'people');
        $hit = new RawDiscoveryHit(name: 'D P', source: 'web', provider: 'serper', snippet: 'CTO for Cede, B2B payments', url: 'https://ng.linkedin.com/in/d-p-7781a', meta: ['title' => 'D P - CTO - Cede | LinkedIn']);
        $org = Organization::query()->create(['name' => 'O', 'slug' => 'o-'.uniqid()]);

        $rows = app(ExtractionService::class)->extractManyBatch([$hit], $brief, $org)[0];

        $this->assertSame([], $rows);
    }
}
