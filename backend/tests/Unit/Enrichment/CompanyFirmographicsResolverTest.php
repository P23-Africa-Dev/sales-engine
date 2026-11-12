<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\CompanyFirmographicsResolver;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CompanyFirmographicsResolverTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.serper.api_key' => 'test-serper', 'services.serper.base_url' => 'https://google.serper.dev']);
        Cache::flush();
    }

    public function test_reads_the_companys_own_linkedin_facts_and_fills_gaps_from_the_knowledge_panel(): void
    {
        Http::fake(['google.serper.dev/search' => function (Request $request) {
            if (str_contains((string) $request['q'], 'company size employees')) {
                return Http::response(['organic' => [
                    // A different company with a similar name: ignored.
                    ['title' => 'Atlas Logistics | LinkedIn', 'link' => 'https://linkedin.com/company/atlas-logistics', 'snippet' => 'Company size: 11-50 employees. Headquarters: Lagos.'],
                    ['title' => 'Atlas Maschinenbau GmbH', 'link' => 'https://de.linkedin.com/company/atlas-maschinenbau', 'snippet' => 'Industrial Machinery Manufacturing Company size 201-500 employees Headquarters Stuttgart, Baden-Württemberg. Primary …'],
                ]]);
            }

            return Http::response(['knowledgeGraph' => [
                'title' => 'Atlas Maschinenbau',
                'website' => 'https://atlas-maschinenbau.de',
                'attributes' => ['Revenue' => '84 million EUR (2024)', 'Headquarters' => 'Stuttgart, Germany'],
            ]]);
        }]);

        $result = app(CompanyFirmographicsResolver::class)->resolveMany(['Atlas Maschinenbau'])['Atlas Maschinenbau'];

        $this->assertSame('Industrial Machinery Manufacturing', $result['industry']);
        $this->assertSame([201, 500], [$result['employees_min'], $result['employees_max']]);
        $this->assertSame('Stuttgart, Baden-Württemberg', $result['headquarters']);
        $this->assertSame('84 million EUR (2024)', $result['revenue']);
        $this->assertSame('https://atlas-maschinenbau.de', $result['website']);
    }

    public function test_reads_the_other_linkedin_snippet_shapes(): void
    {
        Http::fake(['google.serper.dev/search' => function (Request $request) {
            if (str_contains((string) $request['q'], 'company size employees')) {
                return Http::response(['organic' => [
                    ['title' => 'Kodak Alaris', 'link' => 'https://www.linkedin.com/company/kodak-alaris', 'snippet' => 'Company size: 1,001-5,000 employees. Headquarters: Rochester, New York. Type ... Employees at Kodak Alaris.'],
                ]]);
            }

            return Http::response(['organic' => [
                ['title' => 'Kodak Alaris', 'link' => 'https://www.linkedin.com/company/kodak-alaris', 'snippet' => 'Kodak Alaris. Information Services. Rochester, New York 120,456 followers. Capture made simple.'],
            ]]);
        }]);

        $result = app(CompanyFirmographicsResolver::class)->resolveMany(['Kodak Alaris'])['Kodak Alaris'];

        $this->assertSame('Information Services', $result['industry']);
        $this->assertSame('1,001-5,000', $result['employee_range']);
        $this->assertSame('Rochester, New York', $result['headquarters']);
        $this->assertSame('https://www.linkedin.com/company/kodak-alaris', $result['linkedin_url']);
    }

    public function test_headcount_falls_back_to_company_data_sites(): void
    {
        Http::fake(['google.serper.dev/search' => Http::response(['organic' => [
            ['title' => 'Mzuri Sweets - Overview, News & Similar companies', 'link' => 'https://www.zoominfo.com/c/mzuri-sweets-ltd/351228217', 'snippet' => 'How many employees does Mzuri Sweets have? Mzuri Sweets has 201-500 employees.'],
        ]])]);

        $result = app(CompanyFirmographicsResolver::class)->resolveMany(['Mzuri Sweets Ltd'])['Mzuri Sweets Ltd'];

        $this->assertSame([201, 500], [$result['employees_min'], $result['employees_max']]);
    }

    public function test_nothing_is_taken_from_pages_about_another_company(): void
    {
        Http::fake(['google.serper.dev/search' => Http::response(['organic' => [
            ['title' => 'Kenya Breweries | LinkedIn', 'link' => 'https://linkedin.com/company/kbl', 'snippet' => 'Industry: Beverages · Company size: 1,001-5,000 employees'],
        ], 'knowledgeGraph' => ['title' => 'Kenya Breweries', 'attributes' => ['Headquarters' => 'Nairobi']]])]);

        $result = app(CompanyFirmographicsResolver::class)->resolveMany(['Atlas Maschinenbau'])['Atlas Maschinenbau'];

        $this->assertSame(CompanyFirmographicsResolver::empty(), $result);
    }

    public function test_employee_ranges_parse(): void
    {
        $this->assertSame([201, 500], CompanyFirmographicsResolver::parseEmployeeRange('201-500 employees'));
        $this->assertSame([10001, null], CompanyFirmographicsResolver::parseEmployeeRange('10,001+'));
        $this->assertSame([3000, 3000], CompanyFirmographicsResolver::parseEmployeeRange('3,000 (2023)'));
        $this->assertSame([null, null], CompanyFirmographicsResolver::parseEmployeeRange(null));
    }
}
