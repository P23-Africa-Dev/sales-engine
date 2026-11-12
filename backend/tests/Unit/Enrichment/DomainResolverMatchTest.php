<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\DomainResolver;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class DomainResolverMatchTest extends TestCase
{
    /**
     * @return array<string, array{string, string, bool}>
     */
    public static function hostProvider(): array
    {
        return [
            'exact brand' => ['olamgroup.com', 'Olam International', true],
            'brand plus country' => ['cargill.com', 'Cargill Ghana', true],
            'initials' => ['abocfa.com', 'ABOCFA Cooperative', true],
            'industry word is not a company' => ['cocoafederation.com', 'Cocoa Processing Company', false],
            'one generic word only matches exactly' => ['cocoainitiative.org', 'Cocoa', false],
            'generic word exact domain' => ['cocoa.com', 'Cocoa', true],
            'full multi-word name' => ['cocoaprocessingcompany.com', 'Cocoa Processing Company', true],
            'country second-level domain with initials' => ['kcv.co.ke', 'Kenya Climate Ventures', true],
            'distinctive word that is not first' => ['paytech.ng', 'Payment Technology Limited (PAYTECH)', true],
            'listing site is not the company' => ['capboard.io', 'Exponential Impact', false],
            'all-generic name is not a substring match' => ['centralbanking.com', 'Central Bank of Nigeria', false],
            'name plus legal suffix in host' => ['eesolutionslimited.africa', 'EE SOLUTIONS LTD', true],
        ];
    }

    #[DataProvider('hostProvider')]
    public function test_host_matches_company_only_on_identifying_words(string $host, string $company, bool $expected): void
    {
        $this->assertSame($expected, app(DomainResolver::class)->hostMatchesCompany($host, $company));
    }

    public function test_regulator_page_is_not_taken_as_the_company_website(): void
    {
        $resolver = app(DomainResolver::class);

        $this->assertNull($resolver->resolve('https://www.cbn.gov.ng/psp-list', 'Arca Payments Company Limited'));
        $this->assertSame('cbn.gov.ng', $resolver->resolve('https://www.cbn.gov.ng', 'CBN'));
        $this->assertSame('arca.network', $resolver->resolve('https://arca.network', 'Arca Payments Company Limited'));
    }

    public function test_generic_names_are_detected(): void
    {
        $resolver = app(DomainResolver::class);

        $this->assertTrue($resolver->isGenericCompanyName('Cocoa'));
        $this->assertTrue($resolver->isGenericCompanyName('Payments Ltd'));
        $this->assertFalse($resolver->isGenericCompanyName('Cocoa Processing Company'));
        $this->assertFalse($resolver->isGenericCompanyName('Olam'));
    }

    /**
     * @return array<string, array{string, string, bool}>
     */
    public static function strictProvider(): array
    {
        return [
            'exact' => ['bomarts.com', 'Bomarts Farms Limited', true],
            'name plus group' => ['olamgroup.com', 'Olam', true],
            'longer unrelated host' => ['cedev.org', 'Cede', false],
            'name buried in another host' => ['inthismomentofficial.com', 'Moment', false],
            'different company' => ['thevillagecompany.com', 'Village of Naturals', false],
        ];
    }

    #[DataProvider('strictProvider')]
    public function test_a_persons_employer_needs_a_near_exact_domain(string $host, string $company, bool $expected): void
    {
        $this->assertSame($expected, app(DomainResolver::class)->hostMatchesCompany($host, $company, true));
    }
}
