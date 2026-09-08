<?php

namespace Tests\Unit;

use App\Services\Discovery\CompanyNameValidator;
use Tests\TestCase;

class CompanyNameValidatorTest extends TestCase
{
    private CompanyNameValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = app(CompanyNameValidator::class);
    }

    public function test_accepts_real_company_names(): void
    {
        $this->assertTrue($this->validator->isValidCompanyName('Acme Distributors Lagos'));
        $this->assertTrue($this->validator->isValidCompanyName('Global Retail Holdings'));
        $this->assertTrue($this->validator->isValidCompanyName('Nigeria Bottling Company'));
    }

    public function test_rejects_screenshot_non_company_phrases(): void
    {
        $this->assertFalse($this->validator->isValidCompanyName('Matching Requirement'));
        $this->assertFalse($this->validator->isValidCompanyName('500 Qualified Leads Award'));
        $this->assertFalse($this->validator->isValidCompanyName('11 Tips to Generate Sales Leads'));
        $this->assertFalse($this->validator->isValidCompanyName('How I Find 100 Qualified Leads'));
        $this->assertFalse($this->validator->isValidCompanyName('Scaling CEO Peer Groups with Targeted Outreach'));
    }
}
