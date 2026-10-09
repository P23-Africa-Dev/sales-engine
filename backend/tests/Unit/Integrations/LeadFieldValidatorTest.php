<?php

namespace Tests\Unit\Integrations;

use App\Services\Integrations\Factory23\LeadFieldValidator;
use Tests\TestCase;

class LeadFieldValidatorTest extends TestCase
{
    public function test_validate_email(): void
    {
        $v = new LeadFieldValidator;
        $this->assertSame('a@b.com', $v->validateEmail('a@b.com'));
        $this->assertNull($v->validateEmail('not-an-email'));
        $this->assertNull($v->validateEmail(''));
    }

    public function test_validate_phone_rejects_urls_and_short_values(): void
    {
        $v = new LeadFieldValidator;
        $this->assertSame('+1-555-0100', $v->validatePhone('+1-555-0100'));
        $this->assertNull($v->validatePhone('https://example.com'));
        $this->assertNull($v->validatePhone('123'));
        $this->assertNull($v->validatePhone('person@example.com'));
    }

    public function test_validate_url_rejects_phone_and_invalid_hosts(): void
    {
        $v = new LeadFieldValidator;
        $this->assertSame('https://tesla.com', $v->validateUrl('tesla.com'));
        $this->assertSame('https://www.linkedin.com/in/jane', $v->validateUrl('https://www.linkedin.com/in/jane'));
        $this->assertNull($v->validateUrl('+1-555-0100'));
        $this->assertNull($v->validateUrl('not a website'));
        $this->assertNull($v->validateUrl('localhost'));
    }

    public function test_sanitize_payload_drops_invalid_website(): void
    {
        $v = new LeadFieldValidator;
        $result = $v->sanitizePayload([
            'name' => 'Jane',
            'email' => 'jane@example.com',
            'phone' => '+15550100',
            'website' => '+1-555-0100',
            'profile_urls' => ['not-a-url', 'https://linkedin.com/in/jane'],
        ]);

        $this->assertSame('Jane', $result['payload']['name']);
        $this->assertSame('jane@example.com', $result['payload']['email']);
        $this->assertArrayNotHasKey('website', $result['payload']);
        $this->assertSame(['https://linkedin.com/in/jane'], $result['payload']['profile_urls']);
        $this->assertContains('website', $result['dropped']);
    }

    public function test_sanitize_payload_truncates_position_to_120_chars(): void
    {
        $v = new LeadFieldValidator;
        $long = 'CEO/MD MTN Nigeria and Vice President, Francophone Africa at MTN Nigeria and also Regional Lead for West Africa Expansion';
        $this->assertGreaterThan(120, mb_strlen($long));

        $result = $v->sanitizePayload([
            'name' => 'Dr. Karl Olutokun',
            'position' => $long,
            'company_name' => 'MTN Nigeria',
        ]);

        $this->assertLessThanOrEqual(120, mb_strlen((string) $result['payload']['position']));
        $this->assertStringStartsWith('CEO/MD MTN Nigeria', (string) $result['payload']['position']);
        $this->assertContains('position_truncated', $result['dropped']);
    }
}
