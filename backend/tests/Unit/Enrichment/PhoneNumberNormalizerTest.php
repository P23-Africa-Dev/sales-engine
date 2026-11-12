<?php

namespace Tests\Unit\Enrichment;

use App\Services\Enrichment\PhoneNumberNormalizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PhoneNumberNormalizerTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: ?string, 2: ?string}>
     */
    public static function phoneProvider(): array
    {
        return [
            'nigerian national with trunk zero' => ['0803 123 4567', 'Lagos, Nigeria', '+2348031234567'],
            'already international' => ['+234 803 123 4567', null, '+2348031234567'],
            'double zero prefix' => ['00 44 20 7946 0018', null, '+442079460018'],
            'bracketed uk trunk zero' => ['+44 (0)20 7946 0018', null, '+442079460018'],
            'us ten digits' => ['(415) 555-0100', 'United States', '+14155550100'],
            'country code without plus' => ['2348031234567', 'NG', '+2348031234567'],
            'extension dropped' => ['+1 415 555 0100 ext. 22', null, '+14155550100'],
            'unknown country national number' => ['0803 123 4567', null, null],
            'too short' => ['12345', 'Nigeria', null],
            'trunk zero after plus code' => ['+233 0302 211 593', null, '+233302211593'],
            'ghana national' => ['0302 211 593', 'Ghana', '+233302211593'],
            'singapore number written without plus is not made ghanaian' => ['65 6339 4100', 'Ghana', null],
            'us number written without plus is not made ghanaian' => ['1 952 742 2000', 'Ghana', null],
            'italian leading zero kept' => ['+39 06 1234 5678', null, '+390612345678'],
            'kenyan mobile' => ['0728 144 198', 'Kenya', '+254728144198'],
        ];
    }

    #[DataProvider('phoneProvider')]
    public function test_normalizes_to_e164(string $raw, ?string $location, ?string $expected): void
    {
        $normalizer = app(PhoneNumberNormalizer::class);

        $this->assertSame($expected, $normalizer->toE164($raw, $normalizer->countryFromLocation($location)));
    }
}
