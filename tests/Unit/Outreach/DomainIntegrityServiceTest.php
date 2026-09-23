<?php

namespace Tests\Unit\Outreach;

use App\Models\Organization;
use App\Models\OutreachDomainAuthentication;
use App\Models\OutreachIdentity;
use App\Models\User;
use App\Services\Outreach\DomainIntegrityService;
use Tests\TestCase;

class DomainIntegrityServiceTest extends TestCase
{
    public function test_consumer_domain_fails_integrity(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $record = OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'gmail.com',
            'from_email' => 'me@gmail.com',
            'verification_status' => 'verified',
            'valid' => true,
        ]);

        $result = app(DomainIntegrityService::class)->evaluate($record);

        $this->assertSame('fail', $result['status']);
        $this->assertTrue(collect($result['checks'])->contains(
            fn ($c) => $c['key'] === 'consumer_domain' && $c['status'] === 'fail'
        ));
    }

    public function test_failed_recheck_forces_identities_to_platform(): void
    {
        $org = Organization::query()->create(['name' => 'Org', 'slug' => 'org-'.uniqid()]);
        $user = User::factory()->create();

        OutreachIdentity::query()->create([
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'organization',
            'reply_to_email' => $user->email,
        ]);

        $record = OutreachDomainAuthentication::query()->create([
            'organization_id' => $org->id,
            'domain' => 'gmail.com',
            'from_email' => 'me@gmail.com',
            'verification_status' => 'verified',
            'valid' => true,
            'integrity_status' => 'pass',
        ]);

        app(DomainIntegrityService::class)->evaluateAndPersist($record);

        $this->assertDatabaseHas('outreach_identities', [
            'organization_id' => $org->id,
            'user_id' => $user->id,
            'sender_mode' => 'platform',
        ]);
    }
}
