<?php

namespace App\Services\Outreach;

/**
 * Verifies the ECDSA signature SendGrid attaches to Event Webhook deliveries.
 * See: https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
class SendGridWebhookVerifier
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.sendgrid.webhook_public_key')) !== '';
    }

    public function verify(string $rawBody, string $signatureHeader, string $timestampHeader): bool
    {
        $publicKey = trim((string) config('services.sendgrid.webhook_public_key'));
        if ($publicKey === '' || $signatureHeader === '' || $timestampHeader === '') {
            return false;
        }

        $pem = $this->toPem($publicKey);
        $publicKeyResource = openssl_pkey_get_public($pem);
        if ($publicKeyResource === false) {
            return false;
        }

        $signature = base64_decode($signatureHeader, true);
        if ($signature === false) {
            return false;
        }

        $timestampedPayload = $timestampHeader.$rawBody;

        return openssl_verify($timestampedPayload, $signature, $publicKeyResource, OPENSSL_ALGO_SHA256) === 1;
    }

    private function toPem(string $base64Key): string
    {
        $clean = trim($base64Key);
        if (str_contains($clean, 'BEGIN PUBLIC KEY')) {
            return $clean;
        }

        return "-----BEGIN PUBLIC KEY-----\n".wordwrap($clean, 64, "\n", true)."\n-----END PUBLIC KEY-----\n";
    }
}
