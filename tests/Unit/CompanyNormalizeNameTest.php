<?php

namespace Tests\Unit;

use App\Models\Company;
use PHPUnit\Framework\TestCase;

class CompanyNormalizeNameTest extends TestCase
{
    public function test_normalize_strips_legal_suffixes(): void
    {
        $this->assertSame('acme distributors', Company::normalizeName('Acme Distributors Ltd.'));
    }
}
