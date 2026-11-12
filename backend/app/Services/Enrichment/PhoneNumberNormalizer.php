<?php

namespace App\Services\Enrichment;

use App\Services\Discovery\DiscoveryGeo;

/**
 * Best-effort E.164 normalisation without libphonenumber: international
 * prefixes are kept, national numbers get the calling code of the lead's
 * country (from territory/location) with the trunk "0" dropped.
 */
class PhoneNumberNormalizer
{
    /**
     * ISO alpha-2 → country calling code.
     */
    private const CALLING_CODES = [
        'US' => '1', 'CA' => '1', 'BS' => '1', 'BB' => '1', 'JM' => '1', 'TT' => '1', 'DO' => '1',
        'AG' => '1', 'DM' => '1', 'GD' => '1', 'KN' => '1', 'LC' => '1', 'VC' => '1',
        'RU' => '7', 'KZ' => '7', 'EG' => '20', 'ZA' => '27', 'GR' => '30', 'NL' => '31', 'BE' => '32',
        'FR' => '33', 'ES' => '34', 'HU' => '36', 'IT' => '39', 'RO' => '40', 'CH' => '41', 'AT' => '43',
        'GB' => '44', 'DK' => '45', 'SE' => '46', 'NO' => '47', 'PL' => '48', 'DE' => '49', 'PE' => '51',
        'MX' => '52', 'CU' => '53', 'AR' => '54', 'BR' => '55', 'CL' => '56', 'CO' => '57', 'VE' => '58',
        'MY' => '60', 'AU' => '61', 'ID' => '62', 'PH' => '63', 'NZ' => '64', 'SG' => '65', 'TH' => '66',
        'JP' => '81', 'KR' => '82', 'VN' => '84', 'CN' => '86', 'TR' => '90', 'IN' => '91', 'PK' => '92',
        'AF' => '93', 'LK' => '94', 'MM' => '95', 'IR' => '98', 'SS' => '211', 'MA' => '212', 'DZ' => '213',
        'TN' => '216', 'LY' => '218', 'GM' => '220', 'SN' => '221', 'MR' => '222', 'ML' => '223',
        'GN' => '224', 'CI' => '225', 'BF' => '226', 'NE' => '227', 'TG' => '228', 'BJ' => '229',
        'MU' => '230', 'LR' => '231', 'SL' => '232', 'GH' => '233', 'NG' => '234', 'TD' => '235',
        'CF' => '236', 'CM' => '237', 'CV' => '238', 'ST' => '239', 'GQ' => '240', 'GA' => '241',
        'CG' => '242', 'CD' => '243', 'AO' => '244', 'GW' => '245', 'SC' => '248', 'SD' => '249',
        'RW' => '250', 'ET' => '251', 'SO' => '252', 'DJ' => '253', 'KE' => '254', 'TZ' => '255',
        'UG' => '256', 'BI' => '257', 'MZ' => '258', 'ZM' => '260', 'MG' => '261', 'ZW' => '263',
        'NA' => '264', 'MW' => '265', 'LS' => '266', 'BW' => '267', 'SZ' => '268', 'KM' => '269',
        'ER' => '291', 'PT' => '351', 'LU' => '352', 'IE' => '353', 'IS' => '354', 'AL' => '355',
        'MT' => '356', 'CY' => '357', 'FI' => '358', 'BG' => '359', 'LT' => '370', 'LV' => '371',
        'EE' => '372', 'MD' => '373', 'AM' => '374', 'BY' => '375', 'AD' => '376', 'MC' => '377',
        'SM' => '378', 'UA' => '380', 'RS' => '381', 'ME' => '382', 'XK' => '383', 'HR' => '385',
        'SI' => '386', 'BA' => '387', 'MK' => '389', 'CZ' => '420', 'SK' => '421', 'LI' => '423',
        'BZ' => '501', 'GT' => '502', 'SV' => '503', 'HN' => '504', 'NI' => '505', 'CR' => '506',
        'PA' => '507', 'HT' => '509', 'BO' => '591', 'GY' => '592', 'EC' => '593', 'PY' => '595',
        'SR' => '597', 'UY' => '598', 'TL' => '670', 'BN' => '673', 'NR' => '674', 'PG' => '675',
        'TO' => '676', 'SB' => '677', 'VU' => '678', 'FJ' => '679', 'PW' => '680', 'WS' => '685',
        'TV' => '688', 'FM' => '691', 'MH' => '692', 'KP' => '850', 'HK' => '852', 'KH' => '855',
        'LA' => '856', 'BD' => '880', 'TW' => '886', 'MV' => '960', 'LB' => '961', 'JO' => '962',
        'SY' => '963', 'IQ' => '964', 'KW' => '965', 'SA' => '966', 'YE' => '967', 'OM' => '968',
        'PS' => '970', 'AE' => '971', 'IL' => '972', 'BH' => '973', 'QA' => '974', 'BT' => '975',
        'MN' => '976', 'NP' => '977', 'TJ' => '992', 'TM' => '993', 'AZ' => '994', 'GE' => '995',
        'KG' => '996', 'UZ' => '998',
    ];

    /**
     * Allowed national significant-number lengths (after the calling code, without the
     * trunk 0) for countries where they are fixed. A number outside the range was almost
     * always another country's number written without "+" (e.g. "65 6339 4100").
     *
     * @var array<string, array{int, int}>
     */
    private const NATIONAL_LENGTHS = [
        'GH' => [9, 9], 'KE' => [9, 9], 'UG' => [9, 9], 'TZ' => [9, 9], 'RW' => [9, 9], 'ET' => [9, 9],
        'ZA' => [9, 9], 'ZM' => [9, 9], 'SN' => [9, 9], 'CM' => [9, 9], 'MA' => [9, 9], 'CI' => [10, 10],
        'NG' => [8, 10], 'EG' => [8, 10], 'GB' => [9, 10], 'IN' => [10, 10], 'SG' => [8, 8], 'AE' => [8, 9],
        'CH' => [9, 9], 'FR' => [9, 9], 'NL' => [9, 9], 'ES' => [9, 9], 'AU' => [9, 9],
    ];

    /** Countries whose leading 0 is part of the number, not a national trunk prefix. */
    private const KEEPS_LEADING_ZERO = ['39'];

    public function __construct(private readonly DiscoveryGeo $geo) {}

    /**
     * ISO alpha-2 country for free-text territory/location ("Lagos, Nigeria", "UK", "de").
     */
    public function countryFromLocation(?string $location): ?string
    {
        $location = trim((string) $location);
        if ($location === '') {
            return null;
        }

        if (preg_match('/^[a-z]{2}$/i', $location) && isset(self::CALLING_CODES[mb_strtoupper($location)])) {
            return mb_strtoupper($location);
        }

        try {
            $region = $this->geo->regionFromValue($location);
        } catch (\Throwable) {
            return null;
        }

        $iso = $region !== null ? mb_strtoupper((string) ($region['hunterCountry'] ?? '')) : '';

        return $iso !== '' ? $iso : null;
    }

    /**
     * E.164 ("+2348012345678") or null when the number cannot be placed in a country.
     */
    public function toE164(?string $phone, ?string $countryIso = null): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '') {
            return null;
        }

        $phone = preg_replace('/\s*(?:ext\.?|extension|x|#)\s*\d+\s*$/i', '', $phone) ?? $phone;
        $hasPlus = str_starts_with(ltrim($phone), '+');
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return null;
        }

        if ($hasPlus) {
            return $this->validE164($this->dropBracketedTrunkZero($phone, $digits));
        }

        if (str_starts_with($digits, '00')) {
            return $this->validE164(substr($digits, 2));
        }

        $countryIso = $countryIso !== null ? mb_strtoupper($countryIso) : null;
        $callingCode = $countryIso !== null ? (self::CALLING_CODES[$countryIso] ?? null) : null;
        if ($callingCode === null) {
            return null;
        }

        if ($callingCode === '1') {
            if (strlen($digits) === 11 && str_starts_with($digits, '1')) {
                return $this->validE164($digits);
            }

            return strlen($digits) === 10 ? '+1'.$digits : null;
        }

        if (strlen(ltrim($digits, '0')) < 7) {
            return null;
        }

        if (str_starts_with($digits, '0')) {
            return $this->validE164($callingCode.ltrim($digits, '0'));
        }

        if (str_starts_with($digits, $callingCode) && strlen($digits) >= 10 + strlen($callingCode) - 1) {
            return $this->validE164($digits);
        }

        return $this->validE164($callingCode.$digits);
    }

    /**
     * True when an E.164 number belongs to the given country's calling code. Unknown
     * countries match anything (no evidence either way).
     */
    public function belongsToCountry(string $e164, ?string $countryIso): bool
    {
        $code = $countryIso !== null ? (self::CALLING_CODES[mb_strtoupper($countryIso)] ?? null) : null;
        if ($code === null) {
            return true;
        }

        return str_starts_with(ltrim($e164, '+'), $code);
    }

    /**
     * Normalised value when possible, otherwise the cleaned original.
     */
    public function normalizeOrKeep(?string $phone, ?string $countryIso = null): string
    {
        return $this->toE164($phone, $countryIso) ?? trim((string) $phone);
    }

    /**
     * "+44 (0)20 7946 0000" → drop the bracketed national trunk zero.
     */
    private function dropBracketedTrunkZero(string $phone, string $digits): string
    {
        if (preg_match('/^\s*\+(\d{1,3})\s*\(0\)/', $phone, $match)) {
            return $match[1].substr($digits, strlen($match[1]) + 1);
        }

        return $digits;
    }

    private function validE164(string $digits): ?string
    {
        if (str_starts_with($digits, '0')) {
            return null;
        }

        $code = $this->callingCodeOf($digits);
        if ($code !== null) {
            $national = substr($digits, strlen($code));
            if (str_starts_with($national, '0') && ! in_array($code, self::KEEPS_LEADING_ZERO, true)) {
                $national = ltrim($national, '0');
                $digits = $code.$national;
            }
            if (! $this->plausibleNationalLength($code, strlen($national))) {
                return null;
            }
        }

        $length = strlen($digits);
        if ($length < 8 || $length > 15) {
            return null;
        }

        return '+'.$digits;
    }

    /**
     * Calling code at the start of an international number (codes are prefix-free).
     */
    private function callingCodeOf(string $digits): ?string
    {
        $codes = array_flip(self::CALLING_CODES);
        foreach ([1, 2, 3] as $size) {
            $candidate = substr($digits, 0, $size);
            if (isset($codes[$candidate])) {
                return $candidate;
            }
        }

        return null;
    }

    private function plausibleNationalLength(string $code, int $length): bool
    {
        foreach (self::NATIONAL_LENGTHS as $iso => [$min, $max]) {
            if ((self::CALLING_CODES[$iso] ?? null) === $code) {
                return $length >= $min && $length <= $max;
            }
        }

        return true;
    }
}
