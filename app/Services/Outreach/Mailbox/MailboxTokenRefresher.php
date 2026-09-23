<?php

namespace App\Services\Outreach\Mailbox;

use App\Models\OutreachMailbox;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class MailboxTokenRefresher
{
    public function accessToken(OutreachMailbox $mailbox): string
    {
        if ($mailbox->provider === 'smtp') {
            throw new RuntimeException('SMTP mailboxes do not use OAuth tokens.');
        }

        if ($mailbox->access_token && $mailbox->token_expires_at && $mailbox->token_expires_at->isFuture()) {
            return (string) $mailbox->access_token;
        }

        if (! filled($mailbox->refresh_token)) {
            throw new RuntimeException('Mailbox session expired. Reconnect your email account.');
        }

        return match ($mailbox->provider) {
            'google' => $this->refreshGoogle($mailbox),
            'microsoft' => $this->refreshMicrosoft($mailbox),
            'zoho' => $this->refreshZoho($mailbox),
            default => throw new RuntimeException('Unsupported mailbox provider.'),
        };
    }

    private function refreshGoogle(OutreachMailbox $mailbox): string
    {
        $cfg = config('outreach.mailbox.google');
        $response = Http::asForm()->timeout(30)->post('https://oauth2.googleapis.com/token', [
            'client_id' => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $mailbox->refresh_token,
            'grant_type' => 'refresh_token',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Google token refresh failed: '.$response->body());
        }

        return $this->persistTokens($mailbox, $response->json());
    }

    private function refreshMicrosoft(OutreachMailbox $mailbox): string
    {
        $cfg = config('outreach.mailbox.microsoft');
        $tenant = $cfg['tenant'] ?: 'common';
        $response = Http::asForm()->timeout(30)->post(
            "https://login.microsoftonline.com/{$tenant}/oauth2/v2.0/token",
            [
                'client_id' => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'refresh_token' => $mailbox->refresh_token,
                'grant_type' => 'refresh_token',
                'scope' => implode(' ', $cfg['scopes'] ?? []),
            ]
        );

        if (! $response->successful()) {
            throw new RuntimeException('Microsoft token refresh failed: '.$response->body());
        }

        return $this->persistTokens($mailbox, $response->json());
    }

    private function refreshZoho(OutreachMailbox $mailbox): string
    {
        $cfg = config('outreach.mailbox.zoho');
        $dc = (string) ($mailbox->provider_metadata['datacenter'] ?? $cfg['datacenter'] ?? 'com');
        $accountsBase = match ($dc) {
            'eu' => 'https://accounts.zoho.eu',
            'in' => 'https://accounts.zoho.in',
            'au' => 'https://accounts.zoho.com.au',
            'jp' => 'https://accounts.zoho.jp',
            default => 'https://accounts.zoho.com',
        };

        $response = Http::asForm()->timeout(30)->post("{$accountsBase}/oauth/v2/token", [
            'client_id' => $cfg['client_id'],
            'client_secret' => $cfg['client_secret'],
            'refresh_token' => $mailbox->refresh_token,
            'grant_type' => 'refresh_token',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Zoho token refresh failed: '.$response->body());
        }

        return $this->persistTokens($mailbox, $response->json());
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function persistTokens(OutreachMailbox $mailbox, array $payload): string
    {
        $access = (string) ($payload['access_token'] ?? '');
        if ($access === '') {
            throw new RuntimeException('Provider did not return an access token.');
        }

        $expiresIn = (int) ($payload['expires_in'] ?? 3600);
        $mailbox->update([
            'access_token' => $access,
            'refresh_token' => $payload['refresh_token'] ?? $mailbox->refresh_token,
            'token_expires_at' => now()->addSeconds(max(60, $expiresIn - 60)),
            'status' => 'connected',
            'last_error' => null,
            'last_error_at' => null,
        ]);

        return $access;
    }
}
