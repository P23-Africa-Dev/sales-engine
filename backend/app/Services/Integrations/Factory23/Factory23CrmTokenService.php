<?php

namespace App\Services\Integrations\Factory23;

use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class Factory23CrmTokenService
{
    public function registerForOrganization(Organization $organization, string $accessToken): bool
    {
        $token = trim($accessToken);
        if ($token === '' || ! filled($organization->f23_company_id)) {
            return false;
        }

        if (! $this->validateTokenForCompany($token, (string) $organization->f23_company_id)) {
            Log::info('Factory23 CRM token rejected for organization', [
                'organization_id' => $organization->id,
                'f23_company_id' => $organization->f23_company_id,
            ]);

            return false;
        }

        $organization->update([
            'f23_api_token' => $token,
            'f23_api_token_verified_at' => now(),
            'factory23_crm_sync_enabled' => true,
        ]);

        return true;
    }

    public function clearForOrganization(Organization $organization): void
    {
        $organization->update([
            'f23_api_token' => null,
            'f23_api_token_verified_at' => null,
        ]);
    }

    public function resolveToken(Organization $organization): ?string
    {
        $stored = trim((string) ($organization->f23_api_token ?? ''));
        if ($stored !== '') {
            return $stored;
        }

        $companyId = (string) ($organization->f23_company_id ?? '');
        $companyTokens = config('services.factory23.company_tokens');
        if ($companyId !== '' && is_array($companyTokens) && isset($companyTokens[$companyId])) {
            $envToken = trim((string) $companyTokens[$companyId]);
            if ($envToken !== '') {
                return $envToken;
            }
        }

        $default = trim((string) config('services.factory23.api_token'));

        return $default !== '' ? $default : null;
    }

    public function hasResolvableToken(Organization $organization): bool
    {
        return $this->resolveToken($organization) !== null;
    }

    public function validateTokenForCompany(string $token, string $companyId): bool
    {
        $base = rtrim((string) config('services.factory23.api_url'), '/');
        if ($base === '' || trim($token) === '' || trim($companyId) === '') {
            return false;
        }

        try {
            $response = Http::timeout(12)
                ->withToken($token)
                ->get($base.'/api/v1/crm/labels', [
                    'company_id' => $companyId,
                ]);

            return $response->successful();
        } catch (\Throwable $e) {
            Log::warning('Factory23 CRM token validation failed', [
                'company_id' => $companyId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
