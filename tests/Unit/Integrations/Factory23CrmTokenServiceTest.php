<?php

namespace Tests\Unit\Integrations;

use App\Models\Organization;
use App\Services\Integrations\Factory23\Factory23CrmTokenService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class Factory23CrmTokenServiceTest extends TestCase
{
    public function test_registers_valid_token_on_organization(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
        ]);

        [, $org] = $this->actingAsOrgMember();
        $org->update(['f23_company_id' => 42]);

        Http::fake([
            'api.example.com/*' => Http::response(['data' => ['items' => [['slug' => 'new_lead']]]], 200),
        ]);

        $service = app(Factory23CrmTokenService::class);
        $registered = $service->registerForOrganization($org, 'user-token-123');

        $this->assertTrue($registered);
        $this->assertSame('user-token-123', $service->resolveToken($org->fresh()));
        $this->assertTrue($org->fresh()->factory23_crm_sync_enabled);
    }

    public function test_resolve_token_prefers_organization_token_over_env_default(): void
    {
        config([
            'services.factory23.api_url' => 'https://api.example.com',
            'services.factory23.api_token' => 'env-default-token',
        ]);

        $org = Organization::query()->create([
            'name' => 'Org',
            'slug' => 'org-' . uniqid(),
            'f23_company_id' => 99,
            'f23_api_token' => 'stored-org-token',
        ]);

        $service = app(Factory23CrmTokenService::class);
        $this->assertSame('stored-org-token', $service->resolveToken($org));
    }
}
