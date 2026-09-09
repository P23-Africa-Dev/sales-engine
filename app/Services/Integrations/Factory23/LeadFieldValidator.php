<?php

namespace App\Services\Integrations\Factory23;

use Illuminate\Support\Facades\Log;

class LeadFieldValidator
{
    /**
     * Sanitize a CRM push payload so invalid fields never cause a hard 422.
     *
     * @param  array<string, mixed>  $payload
     * @return array{payload: array<string, mixed>, dropped: list<string>}
     */
    public function sanitizePayload(array $payload): array
    {
        $dropped = [];

        if (array_key_exists('email', $payload)) {
            $email = $this->validateEmail(is_string($payload['email']) ? $payload['email'] : null);
            if ($email === null && filled($payload['email'] ?? null)) {
                $dropped[] = 'email';
            }
            $payload['email'] = $email;
        }

        if (array_key_exists('phone', $payload)) {
            $phone = $this->validatePhone(is_string($payload['phone']) ? $payload['phone'] : null);
            if ($phone === null && filled($payload['phone'] ?? null)) {
                $dropped[] = 'phone';
            }
            $payload['phone'] = $phone;
        }

        if (array_key_exists('website', $payload)) {
            $website = $this->validateUrl(is_string($payload['website']) ? $payload['website'] : null);
            if ($website === null && filled($payload['website'] ?? null)) {
                $dropped[] = 'website';
            }
            $payload['website'] = $website;
        }

        if (array_key_exists('profile_urls', $payload) && is_array($payload['profile_urls'])) {
            $valid = [];
            foreach ($payload['profile_urls'] as $url) {
                if (! is_string($url)) {
                    continue;
                }
                $normalized = $this->validateUrl($url);
                if ($normalized !== null) {
                    $valid[] = $normalized;
                }
            }
            if (count($valid) < count($payload['profile_urls'])) {
                $dropped[] = 'profile_urls';
            }
            $payload['profile_urls'] = $valid !== [] ? array_values(array_unique($valid)) : null;
        }

        $payload = array_filter($payload, fn ($value) => $value !== null && $value !== '');

        if ($dropped !== []) {
            Log::info('CRM lead payload fields sanitized/dropped', ['dropped' => $dropped]);
        }

        return [
            'payload' => $payload,
            'dropped' => $dropped,
        ];
    }

    public function validateEmail(?string $email): ?string
    {
        $email = trim((string) $email);
        if ($email === '') {
            return null;
        }

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    public function validatePhone(?string $phone): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '') {
            return null;
        }

        // Reject values that are clearly URLs or emails.
        if (str_contains($phone, '@') || preg_match('/^https?:\/\//i', $phone)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) < 7 || strlen($digits) > 15) {
            return null;
        }

        return mb_substr($phone, 0, 40);
    }

    public function validateUrl(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return null;
        }

        if ($this->looksLikePhoneOrEmail($url)) {
            return null;
        }

        if (! preg_match('/^https?:\/\//i', $url)) {
            $url = 'https://'.$url;
        }

        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '' || ! str_contains($host, '.')) {
            return null;
        }

        return $url;
    }

    private function looksLikePhoneOrEmail(string $value): bool
    {
        if (str_contains($value, '@') && filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return true;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return strlen($digits) >= 7 && preg_match('/^[\d\s\-\+\(\)\.]+$/', $value) === 1;
    }
}
