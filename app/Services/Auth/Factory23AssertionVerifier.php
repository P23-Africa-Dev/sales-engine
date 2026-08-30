<?php

namespace App\Services\Auth;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use InvalidArgumentException;
use UnexpectedValueException;

class Factory23AssertionVerifier
{
    /**
     * @return array{sub: string, email: string, name?: string, company_id?: string|null, company_name?: string|null, exp?: int}
     */
    public function verify(string $assertion): array
    {
        $secret = (string) config('services.factory23.jwt_secret');
        if ($secret === '') {
            throw new InvalidArgumentException('FACTORY23_JWT_SECRET is not configured.');
        }

        try {
            $decoded = JWT::decode($assertion, new Key($secret, 'HS256'));
        } catch (\Throwable $e) {
            throw new UnexpectedValueException('Invalid Factory23 assertion: '.$e->getMessage(), 0, $e);
        }

        $claims = (array) $decoded;
        if (empty($claims['sub']) || empty($claims['email'])) {
            throw new UnexpectedValueException('Assertion missing required claims (sub, email).');
        }

        return $claims;
    }
}
