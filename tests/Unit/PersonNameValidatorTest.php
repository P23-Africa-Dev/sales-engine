<?php

namespace Tests\Unit;

use App\Services\Discovery\PersonNameValidator;
use App\Services\Discovery\QueryIntentService;
use Tests\TestCase;

class PersonNameValidatorTest extends TestCase
{
    private PersonNameValidator $validator;

    private QueryIntentService $queryIntent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->validator = app(PersonNameValidator::class);
        $this->queryIntent = app(QueryIntentService::class);
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

    public function test_accepts_linkedin_slug_names_with_title_tokens_stripped(): void
    {
        $this->assertTrue($this->validator->isValidPersonName('Jane Doe Ceo Fintech Africa'));
        $this->assertSame('Jane Doe Fintech', $this->validator->normalizePersonName('Jane Doe Ceo Fintech Africa'));
        $this->assertTrue($this->validator->isValidPersonName('Chidera Okolie Cto Lagos'));
        $this->assertSame('Chidera Okolie Lagos', $this->validator->normalizePersonName('Chidera Okolie Cto Lagos'));
    }

    public function test_rejects_screenshot_non_person_headlines(): void
    {
        $this->assertFalse($this->validator->isValidPersonName('Scaling CEO Peer Groups with Targeted Outreach'));
        $this->assertFalse($this->validator->isValidPersonName('11 Tips to Generate Sales Leads'));
        $this->assertFalse($this->validator->isValidPersonName('How I Find 100 Qualified Leads'));
    }

    public function test_content_phrase_detector_catches_advice_titles(): void
    {
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('11 Tips to Generate Sales Leads'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('How I Find 100 Qualified Leads'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('Scaling CEO Peer Groups with Targeted Outreach'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('Matching Requirement'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('500 Qualified Leads Award'));
        $this->assertFalse($this->queryIntent->looksLikeContentOrGenericPhrase('Acme Distributors Lagos'));
        $this->assertFalse($this->queryIntent->looksLikeContentOrGenericPhrase('Elon Musk'));
    }

    public function test_rejects_market_report_and_category_titles(): void
    {
        $this->assertFalse($this->validator->isValidPersonName('Construction Equipment Market'));
        $this->assertFalse($this->validator->isValidPersonName('Loader Market Research'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('Construction Equipment Market'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('Loader Market Research'));
        $this->assertTrue($this->queryIntent->looksLikeContentOrGenericPhrase('Global Industry Outlook 2024'));

        $this->assertTrue($this->validator->isValidPersonName('Jane Doe', [
            'linkedin_url' => 'https://www.linkedin.com/in/jane-doe',
        ]));
    }
}
