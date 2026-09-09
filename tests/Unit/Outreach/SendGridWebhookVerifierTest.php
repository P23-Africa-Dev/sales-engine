<?php

namespace Tests\Unit\Outreach;

use App\Services\Outreach\SendGridWebhookVerifier;
use Tests\TestCase;

class SendGridWebhookVerifierTest extends TestCase
{
    // Synthetic EC (P-256) test-only keypair, used solely to exercise the
    // signature verification logic below. Not tied to any real account.
    private const TEST_PRIVATE_KEY_PEM = <<<'PEM'
    -----BEGIN EC PRIVATE KEY-----
    MHcCAQEEIDwA54l/bH4vIEv/29zXj2e01xU4HKmetUM9LT0NdzxaoAoGCCqGSM49
    AwEHoUQDQgAEO7HmS+MlLTdLsEC0H1gbG9hKW/6MGotVQRuLTzroyhaCbTzJJppA
    MoMu+asIryZkIjHJPIKMJuiJnYKiD+aU4Q==
    -----END EC PRIVATE KEY-----
    PEM;

    // Base64 SPKI body only (no PEM headers) — matches the raw format SendGrid's
    // "Get Signed Event Webhook's Public Key" API returns.
    private const TEST_PUBLIC_KEY_BASE64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEO7HmS+MlLTdLsEC0H1gbG9hKW/6MGotVQRuLTzroyhaCbTzJJppAMoMu+asIryZkIjHJPIKMJuiJnYKiD+aU4Q==';

    public function test_verify_accepts_a_correctly_signed_payload(): void
    {
        config(['services.sendgrid.webhook_public_key' => self::TEST_PUBLIC_KEY_BASE64]);

        $rawBody = '[{"event":"delivered","email":"a@example.com"}]';
        $timestamp = '1700000000';
        $signatureBase64 = $this->sign($timestamp.$rawBody);

        $verifier = new SendGridWebhookVerifier();

        $this->assertTrue($verifier->isConfigured());
        $this->assertTrue($verifier->verify($rawBody, $signatureBase64, $timestamp));
    }

    public function test_verify_rejects_a_tampered_payload(): void
    {
        config(['services.sendgrid.webhook_public_key' => self::TEST_PUBLIC_KEY_BASE64]);

        $rawBody = '[{"event":"delivered","email":"a@example.com"}]';
        $timestamp = '1700000000';
        $signatureBase64 = $this->sign($timestamp.$rawBody);

        $verifier = new SendGridWebhookVerifier();

        $this->assertFalse($verifier->verify('[{"event":"bounce","email":"a@example.com"}]', $signatureBase64, $timestamp));
    }

    public function test_verify_rejects_wrong_signature(): void
    {
        config(['services.sendgrid.webhook_public_key' => self::TEST_PUBLIC_KEY_BASE64]);

        $verifier = new SendGridWebhookVerifier();

        $this->assertFalse($verifier->verify('{}', base64_encode('not-a-real-signature'), '1700000000'));
    }

    public function test_not_configured_when_public_key_missing(): void
    {
        config(['services.sendgrid.webhook_public_key' => null]);

        $verifier = new SendGridWebhookVerifier();

        $this->assertFalse($verifier->isConfigured());
    }

    private function sign(string $data): string
    {
        $privateKey = openssl_pkey_get_private(self::TEST_PRIVATE_KEY_PEM);
        openssl_sign($data, $signature, $privateKey, OPENSSL_ALGO_SHA256);

        return base64_encode($signature);
    }
}
