<?php

namespace App\Services\Outreach;

use InvalidArgumentException;

class PhoneNumber
{
    /**
     * Normalize a phone number to E.164 (+ and digits).
     * Local 11-digit numbers starting with 0 are treated as Nigeria (+234).
     */
    public static function toE164(string $raw): string
    {
        $trimmed = trim($raw);
        $compact = preg_replace('/[^\d+]/', '', $trimmed) ?? '';

        if ($compact === '') {
            throw new InvalidArgumentException('A valid recipient phone number is required to send SMS.');
        }

        if (str_starts_with($compact, '00')) {
            $compact = '+'.substr($compact, 2);
        }

        if (str_starts_with($compact, '+')) {
            $digits = substr($compact, 1);
        } elseif (strlen($compact) === 11 && str_starts_with($compact, '0')) {
            $digits = '234'.substr($compact, 1);
        } else {
            $digits = ltrim($compact, '0');
        }

        if (! preg_match('/^\d{8,15}$/', $digits)) {
            throw new InvalidArgumentException('Enter a phone number in international format, for example +2348012345678.');
        }

        return '+'.$digits;
    }
}
