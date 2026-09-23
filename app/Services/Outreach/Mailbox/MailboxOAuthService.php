<?php

namespace App\Services\Outreach\Mailbox;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

class MailboxOAuthService
{
    /**
     * @return array{authorization_url: string, state: string}
     */
    public function begin(string $provider, int $organizationId, int $userId): array
    {
        $this->assertProviderConfigured($provider);

        $nonce = Str::random(40);
        $statePayload = [
            'provider' => $provider,
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'nonce' => $nonce,
        ];
        $state = Crypt::encryptString(json_encode($statePayload, JSON_THROW_ON_ERROR));
        Cache::put($this->cacheKey($nonce), true, now()->addMinutes(10));

        return [
            'authorization_url' => $this->authorizationUrl($provider, $state),
            'state' => $state,
        ];
    }

    /**
     * @return array{organization_id: int, user_id: int, provider: string, email: string, access_token: string, refresh_token: ?string, expires_in: int, scopes: array, metadata: array}
     */
    public function complete(string $provider, string $code, string $state): array
    {
        $decoded = json_decode(Crypt::decryptString($state), true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($decoded) || ($decoded['provider'] ?? null) !== $provider) {
            throw new InvalidArgumentException('Invalid OAuth state.');
        }

        $nonce = (string) ($decoded['nonce'] ?? '');
        if ($nonce === '' || ! Cache::pull($this->cacheKey($nonce))) {
            throw new InvalidArgumentException('OAuth state expired. Start the connection again.');
        }

        $tokens = $this->exchangeCode($provider, $code);
        $profile = $this->fetchProfile($provider, $tokens['access_token'], $tokens);

        return [
            'organization_id' => (int) $decoded['organization_id'],
            'user_id' => (int) $decoded['user_id'],
            'provider' => $provider,
            'email' => $profile['email'],
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'] ?? null,
            'expires_in' => (int) ($tokens['expires_in'] ?? 3600),
            'scopes' => $tokens['scopes'] ?? config("outreach.mailbox.{$provider}.scopes", []),
            'metadata' => $profile['metadata'] ?? [],
        ];
    }

    private function authorizationUrl(string $provider, string $state): string
    {
        $cfg = config("outreach.mailbox.{$provider}");
        $redirect = $this->redirectUri($provider);

        return match ($provider) {
            'google' => 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
                'client_id' => $cfg['client_id'],
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'scope' => implode(' ', $cfg['scopes']),
                'access_type' => 'offline',
                'prompt' => 'consent',
                'include_granted_scopes' => 'false',
                'state' => $state,
            ], '', '&', PHP_QUERY_RFC3986),
            'microsoft' => 'https://login.microsoftonline.com/'.($cfg['tenant'] ?: 'common').'/oauth2/v2.0/authorize?'.http_build_query([
                'client_id' => $cfg['client_id'],
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'response_mode' => 'query',
                'scope' => implode(' ', $cfg['scopes']),
                'prompt' => 'consent',
                'state' => $state,
            ], '', '&', PHP_QUERY_RFC3986),
            'zoho' => $this->zohoAccountsBase($cfg['datacenter'] ?? 'com').'/oauth/v2/auth?'.http_build_query([
                'client_id' => $cfg['client_id'],
                'redirect_uri' => $redirect,
                'response_type' => 'code',
                'scope' => implode(',', $cfg['scopes']),
                'access_type' => 'offline',
                'prompt' => 'consent',
                'state' => $state,
            ], '', '&', PHP_QUERY_RFC3986),
            default => throw new InvalidArgumentException('Unsupported OAuth provider.'),
        };
    }

    /**
     * @return array{access_token: string, refresh_token?: string, expires_in?: int, scopes?: array}
     */
    private function exchangeCode(string $provider, string $code): array
    {
        $cfg = config("outreach.mailbox.{$provider}");
        $redirect = $this->redirectUri($provider);

        $response = match ($provider) {
            'google' => Http::asForm()->timeout(30)->post('https://oauth2.googleapis.com/token', [
                'code' => $code,
                'client_id' => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'redirect_uri' => $redirect,
                'grant_type' => 'authorization_code',
            ]),
            'microsoft' => Http::asForm()->timeout(30)->post(
                'https://login.microsoftonline.com/'.($cfg['tenant'] ?: 'common').'/oauth2/v2.0/token',
                [
                    'code' => $code,
                    'client_id' => $cfg['client_id'],
                    'client_secret' => $cfg['client_secret'],
                    'redirect_uri' => $redirect,
                    'grant_type' => 'authorization_code',
                    'scope' => implode(' ', $cfg['scopes']),
                ]
            ),
            'zoho' => Http::asForm()->timeout(30)->post(
                $this->zohoAccountsBase($cfg['datacenter'] ?? 'com').'/oauth/v2/token',
                [
                    'code' => $code,
                    'client_id' => $cfg['client_id'],
                    'client_secret' => $cfg['client_secret'],
                    'redirect_uri' => $redirect,
                    'grant_type' => 'authorization_code',
                ]
            ),
            default => throw new InvalidArgumentException('Unsupported OAuth provider.'),
        };

        if (! $response->successful()) {
            throw new RuntimeException(ucfirst($provider).' token exchange failed: '.$response->body());
        }

        $json = $response->json();
        $access = (string) ($json['access_token'] ?? '');
        if ($access === '') {
            throw new RuntimeException(ucfirst($provider).' did not return an access token.');
        }

        return [
            'access_token' => $access,
            'refresh_token' => $json['refresh_token'] ?? null,
            'expires_in' => (int) ($json['expires_in'] ?? 3600),
            'scopes' => isset($json['scope'])
                ? preg_split('/[\s,]+/', (string) $json['scope']) ?: []
                : ($cfg['scopes'] ?? []),
        ];
    }

    /**
     * @param  array<string, mixed>  $tokens
     * @return array{email: string, metadata: array<string, mixed>}
     */
    private function fetchProfile(string $provider, string $accessToken, array $tokens): array
    {
        return match ($provider) {
            'google' => $this->googleProfile($accessToken),
            'microsoft' => $this->microsoftProfile($accessToken),
            'zoho' => $this->zohoProfile($accessToken),
            default => throw new InvalidArgumentException('Unsupported OAuth provider.'),
        };
    }

    /** @return array{email: string, metadata: array<string, mixed>} */
    private function googleProfile(string $accessToken): array
    {
        $response = Http::withToken($accessToken)->timeout(20)->get('https://www.googleapis.com/oauth2/v3/userinfo');
        if (! $response->successful()) {
            throw new RuntimeException('Could not load Google profile.');
        }
        $email = mb_strtolower((string) ($response->json('email') ?? ''));
        if ($email === '') {
            throw new RuntimeException('Google account email is missing.');
        }

        return ['email' => $email, 'metadata' => []];
    }

    /** @return array{email: string, metadata: array<string, mixed>} */
    private function microsoftProfile(string $accessToken): array
    {
        $response = Http::withToken($accessToken)->timeout(20)->get('https://graph.microsoft.com/v1.0/me');
        if (! $response->successful()) {
            throw new RuntimeException('Could not load Microsoft profile.');
        }
        $email = mb_strtolower((string) ($response->json('mail') ?: $response->json('userPrincipalName') ?: ''));
        if ($email === '' || ! str_contains($email, '@')) {
            throw new RuntimeException('Microsoft account email is missing.');
        }

        return ['email' => $email, 'metadata' => []];
    }

    /** @return array{email: string, metadata: array<string, mixed>} */
    private function zohoProfile(string $accessToken): array
    {
        $dc = (string) config('outreach.mailbox.zoho.datacenter', 'com');
        $apiBase = match ($dc) {
            'eu' => 'https://mail.zoho.eu/api',
            'in' => 'https://mail.zoho.in/api',
            'au' => 'https://mail.zoho.com.au/api',
            'jp' => 'https://mail.zoho.jp/api',
            default => 'https://mail.zoho.com/api',
        };

        $response = Http::withToken($accessToken)->timeout(20)->get("{$apiBase}/accounts");
        if (! $response->successful()) {
            throw new RuntimeException('Could not load Zoho mail accounts.');
        }

        $accounts = $response->json('data') ?? $response->json() ?? [];
        if (! is_array($accounts) || $accounts === []) {
            throw new RuntimeException('No Zoho mail accounts found.');
        }

        $primary = $accounts[0];
        $email = mb_strtolower((string) ($primary['primaryEmailAddress'] ?? $primary['emailAddress'] ?? ''));
        $accountId = (string) ($primary['accountId'] ?? $primary['accountId'] ?? '');
        if ($email === '' || $accountId === '') {
            throw new RuntimeException('Zoho account email or id is missing.');
        }

        return [
            'email' => $email,
            'metadata' => [
                'zoho_account_id' => $accountId,
                'datacenter' => $dc,
            ],
        ];
    }

    private function redirectUri(string $provider): string
    {
        $configured = trim((string) config("outreach.mailbox.{$provider}.redirect_uri"));
        if ($configured !== '') {
            return $configured;
        }

        return rtrim((string) config('app.url'), '/')."/api/v1/outreach/mailboxes/oauth/{$provider}/callback";
    }

    private function zohoAccountsBase(string $dc): string
    {
        return match ($dc) {
            'eu' => 'https://accounts.zoho.eu',
            'in' => 'https://accounts.zoho.in',
            'au' => 'https://accounts.zoho.com.au',
            'jp' => 'https://accounts.zoho.jp',
            default => 'https://accounts.zoho.com',
        };
    }

    private function assertProviderConfigured(string $provider): void
    {
        if (! in_array($provider, ['google', 'microsoft', 'zoho'], true)) {
            throw new InvalidArgumentException('Unsupported OAuth provider.');
        }

        $cfg = config("outreach.mailbox.{$provider}");
        if (! filled($cfg['client_id'] ?? null) || ! filled($cfg['client_secret'] ?? null)) {
            throw new RuntimeException(ucfirst($provider).' mailbox OAuth is not configured.');
        }
    }

    private function cacheKey(string $nonce): string
    {
        return 'outreach_mailbox_oauth:'.$nonce;
    }
}
