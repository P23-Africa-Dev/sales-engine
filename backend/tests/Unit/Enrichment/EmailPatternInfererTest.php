<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\EmailPatternInferer;
use App\Services\Enrichment\MxRecordChecker;
use Tests\TestCase;

class EmailPatternInfererTest extends TestCase
{
    public function test_learns_pattern_from_named_emails_and_generates_for_person(): void
    {
        $this->mock(MxRecordChecker::class)->shouldReceive('hasMx')->with('acme.com')->andReturn(true);

        $result = app(EmailPatternInferer::class)->infer('Dr. Adaeze Okafor-Bello', 'acme.com', [
            ['email' => 'jsmith@acme.com', 'name' => 'John Smith'],
            ['email' => 'mjones@acme.com', 'name' => 'Mary Jones'],
            ['email' => 'info@acme.com', 'name' => null],
            ['email' => 'peter.pan@other.com', 'name' => 'Peter Pan'],
        ]);

        $this->assertSame(['email' => 'aokaforbello@acme.com', 'pattern' => 'flast'], $result);
    }

    public function test_learns_dotted_pattern_without_names(): void
    {
        $this->mock(MxRecordChecker::class)->shouldReceive('hasMx')->andReturn(true);

        $result = app(EmailPatternInferer::class)->infer('Jane Doe', 'acme.com', [
            ['email' => 'john.smith@acme.com'],
        ]);

        $this->assertSame(['email' => 'jane.doe@acme.com', 'pattern' => 'first.last'], $result);
    }

    public function test_returns_null_when_domain_has_no_mx_record(): void
    {
        $this->mock(MxRecordChecker::class)->shouldReceive('hasMx')->with('acme.com')->andReturn(false);

        $result = app(EmailPatternInferer::class)->infer('Jane Doe', 'acme.com', [
            ['email' => 'john.smith@acme.com', 'name' => 'John Smith'],
        ]);

        $this->assertNull($result);
    }

    public function test_returns_null_when_only_generic_mailboxes_are_known(): void
    {
        $this->mock(MxRecordChecker::class)->shouldNotReceive('hasMx');

        $result = app(EmailPatternInferer::class)->infer('Jane Doe', 'acme.com', [
            ['email' => 'info@acme.com'],
            ['email' => 'sales@acme.com'],
        ]);

        $this->assertNull($result);
    }
}
