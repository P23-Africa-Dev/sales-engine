<?php

namespace Tests\Unit;

use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\QueryIntentService;
use Tests\TestCase;

class PersonNameValidatorTest extends TestCase
{
    private PersonNameValidator $validator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = app(PersonNameValidator::class);
    }

    public function test_rejects_fragment_names(): void
    {
        $this->assertFalse($this->validator->isValidPersonName('For'));
        $this->assertFalse($this->validator->isValidPersonName('Info'));
        $this->assertFalse($this->validator->isValidPersonName('The World'));
        $this->assertFalse($this->validator->isValidPersonName('Interviewing Billionaires'));
    }

    public function test_accepts_real_person_names(): void
    {
        $this->assertTrue($this->validator->isValidPersonName('Elon Musk'));
        $this->assertTrue($this->validator->isValidPersonName('Jeff Bezos'));
        $this->assertTrue($this->validator->isValidPersonName('Bernard Arnault'));
    }

    public function test_accepts_single_name_with_title_and_company(): void
    {
        $this->assertTrue($this->validator->isValidPersonName('Jensen', [
            'title' => 'CEO',
            'company' => 'Nvidia',
            'low_confidence' => false,
        ]));
    }
}
