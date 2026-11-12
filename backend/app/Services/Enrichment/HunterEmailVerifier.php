<?php

namespace App\Services\Enrichment;

use App\Models\Organization;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Checks one contact email with Hunter's email verifier. The API key goes in the
 * X-API-KEY header (never the URL); results are cached for 30 days per address.
 */
class HunterEmailVerifier
{
    public const STATUS_VERIFIED = 'verified';

    public const STATUS_LIKELY = 'likely';

    /** The mailbox does not exist: the email must be dropped. */
    public const STATUS_INVALID = 'invalid';

    private const CACHE_TTL_SECONDS = 2592000; // 30 days

    public function __construct(private readonly EnrichmentUsageTracker $usageTracker) {}

    public function isEnabled(): bool
    {
        return trim((string) config('services.hunter.api_key')) !== ''
            && (bool) config('services.contact_finder.verify_emails', true);
    }

    /**
     * @return self::STATUS_*|null Null when the check could not run (disabled, error, still pending).
     */
    public function verify(Organization $organization, string $email, ?string $personName = null, ?int $socialSignalId = null): ?string
    {
        $email = mb_strtolower(trim($email));
        if (! $this->isEnabled() || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        $cacheKey = 'hunter_email_verifier:'.sha1($email);
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return $this->mapStatus($cached);
        }

        $hunterStatus = $this->fetchStatus($email);
        $mapped = $hunterStatus !== null ? $this->mapStatus($hunterStatus) : null;

        $this->usageTracker->logEnrichment(
            $organization,
            'verify',
            'hunter_verifier',
            $mapped === self::STATUS_VERIFIED,
            false,
            $hunterStatus !== null ? 1 : 0,
            $personName,
            null,
            ['hunter_status' => $hunterStatus ?? 'unavailable', 'email_status' => $mapped],
            $socialSignalId,
        );

        if ($hunterStatus !== null) {
            Cache::put($cacheKey, $hunterStatus, self::CACHE_TTL_SECONDS);
        }

        return $mapped;
    }

    /**
     * valid → verified; accept_all / unknown / webmail → likely; invalid / disposable → invalid.
     *
     * @return self::STATUS_*
     */
    public function mapStatus(string $hunterStatus): string
    {
        return match (mb_strtolower(trim($hunterStatus))) {
            'valid' => self::STATUS_VERIFIED,
            'invalid', 'disposable' => self::STATUS_INVALID,
            default => self::STATUS_LIKELY,
        };
    }

    private function fetchStatus(string $email): ?string
    {
        try {
            $response = Http::timeout(20)
                ->withHeaders(['X-API-KEY' => (string) config('services.hunter.api_key')])
                ->get('https://api.hunter.io/v2/email-verifier', ['email' => $email]);

            // 202 = Hunter is still checking the mail server; treat as not verified yet.
            if (! $response->successful() || $response->status() === 202) {
                Log::warning('Hunter email verifier failed', ['status' => $response->status()]);

                return null;
            }

            $status = trim((string) ($response->json('data.status') ?? ''));

            return $status !== '' ? $status : null;
        } catch (\Throwable $e) {
            Log::warning('Hunter email verifier exception', ['error' => $e->getMessage()]);

            return null;
        }
    }
}
