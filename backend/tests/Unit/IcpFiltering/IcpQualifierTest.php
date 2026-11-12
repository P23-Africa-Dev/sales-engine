<?php

namespace Tests\Unit\IcpFiltering;

use App\Models\IcpProfile;
use App\Services\Discovery\DTO\IcpBrief;
use App\Services\Enrichment\CompanyFirmographicsResolver;
use App\Services\IcpFiltering\IcpQualifier;
use Tests\TestCase;

class IcpQualifierTest extends TestCase
{
    /**
     * @param  array<string, mixed>  $config
     */
    private function brief(array $config): IcpBrief
    {
        return IcpBrief::fromIcpProfile(new IcpProfile(['name' => 'ICP', 'config' => array_merge(IcpProfile::defaultConfig(), $config)]));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function company(array $overrides): array
    {
        $company = array_merge(CompanyFirmographicsResolver::empty(), $overrides);
        [$company['employees_min'], $company['employees_max']] = CompanyFirmographicsResolver::parseEmployeeRange($company['employee_range']);

        return $company;
    }

    public function test_spec_example_german_manufacturer_entering_kenya_qualifies_for_africa(): void
    {
        $brief = $this->brief(['industries' => ['Industrial Manufacturing'], 'companySizes' => ['51-200', '201-500'], 'territories' => ['Africa']]);

        $result = app(IcpQualifier::class)->qualify(
            $brief,
            $this->company(['industry' => 'Industrial Machinery Manufacturing', 'employee_range' => '201-500', 'headquarters' => 'Stuttgart, Germany']),
            ['territory' => 'Kenya'],
        );

        $this->assertSame('qualified', $result['status']);
    }

    public function test_unknown_size_is_partly_verified_not_rejected(): void
    {
        $brief = $this->brief(['industries' => ['Fintech'], 'companySizes' => ['51-200'], 'territories' => ['Nigeria']]);

        $result = app(IcpQualifier::class)->qualify($brief, $this->company(['industry' => 'Financial Services', 'headquarters' => 'Lagos']), []);

        $this->assertSame('partial', $result['status']);
        $this->assertSame(['industry' => 'verified', 'company_size' => 'unknown', 'territory' => 'verified'], $result['dimensions']);
    }

    public function test_conflicting_size_or_place_is_not_qualified(): void
    {
        $brief = $this->brief(['companySizes' => ['51-200', '201-500'], 'territories' => ['West Africa']]);
        $qualifier = app(IcpQualifier::class);

        $this->assertSame('not_qualified', $qualifier->qualify($brief, $this->company(['employee_range' => '10,001+', 'headquarters' => 'Accra, Ghana']), [])['status']);
        $this->assertSame('not_qualified', $qualifier->qualify($brief, $this->company(['employee_range' => '201-500', 'headquarters' => 'Berlin, Germany']), ['territory' => 'Brazil'])['status']);
    }

    public function test_industry_read_off_a_post_can_confirm_but_never_reject(): void
    {
        $brief = $this->brief(['industries' => ['Agritech']]);
        $qualifier = app(IcpQualifier::class);

        $this->assertSame('verified', $qualifier->qualify($brief, $this->company([]), ['industry' => 'Agriculture'])['dimensions']['industry']);
        $this->assertSame('unknown', $qualifier->qualify($brief, $this->company([]), ['industry' => 'Real estate'])['dimensions']['industry']);
        $this->assertSame('contradicted', $qualifier->qualify($brief, $this->company(['industry' => 'Real Estate']), [])['dimensions']['industry']);
    }

    public function test_unspecified_dimensions_are_not_judged(): void
    {
        $result = app(IcpQualifier::class)->qualify($this->brief(['industries' => [], 'territories' => []]), $this->company([]), []);

        $this->assertSame(['status' => 'qualified', 'dimensions' => []], $result);
    }

    public function test_based_in_and_target_territory_are_judged_separately(): void
    {
        $brief = $this->brief(['companyLocations' => ['Germany', 'Netherlands'], 'territories' => ['Africa']]);
        $qualifier = app(IcpQualifier::class);

        $german = $qualifier->qualify($brief, $this->company(['headquarters' => 'Stuttgart, Germany']), ['territory' => 'Nairobi, Kenya']);
        $this->assertSame(['company_location' => 'verified', 'territory' => 'verified'], $german['dimensions']);

        // A Kenyan company opening in Kenya is in the territory but not based where the ICP asks.
        $local = $qualifier->qualify($brief, $this->company(['headquarters' => 'Mombasa, Kenya']), ['territory' => 'Kenya']);
        $this->assertSame('not_qualified', $local['status']);
        $this->assertSame('contradicted', $local['dimensions']['company_location']);

        // A German company expanding into Brazil is based right but in the wrong market.
        $this->assertSame('contradicted', $qualifier->qualify($brief, $this->company(['headquarters' => 'Berlin']), ['territory' => 'Brazil'])['dimensions']['territory']);
    }
}
