<?php

namespace App\Services\Discovery;

/**
 * Per-run retrieval health. Adapters record every call so a run can tell the
 * difference between "searched and found nothing" and "the provider refused
 * every call" (expired key, exhausted credits, rate limit).
 */
class DiscoveryProviderHealth
{
    public const REASON_CREDITS = 'credits_exhausted';

    public const REASON_UNAUTHORIZED = 'unauthorized';

    public const REASON_RATE_LIMITED = 'rate_limited';

    public const REASON_ERROR = 'error';

    /** Providers that retrieve from the open web; losing these blinds discovery. */
    private const WEB_SEARCH_PROVIDERS = ['serper'];

    /** @var array<string, array{attempts: int, failures: int, last_status: int|null, reason: string|null, message: string|null}> */
    private array $providers = [];

    public function reset(): void
    {
        $this->providers = [];
    }

    public function recordSuccess(string $provider): void
    {
        $key = $this->normalize($provider);
        $this->touch($key);
        $this->providers[$key]['attempts']++;
    }

    public function recordFailure(string $provider, int $status, string $body = ''): void
    {
        $key = $this->normalize($provider);
        $this->touch($key);
        $this->providers[$key]['attempts']++;
        $this->providers[$key]['failures']++;
        $this->providers[$key]['last_status'] = $status;
        $this->providers[$key]['reason'] = $this->classify($status, $body);
        $this->providers[$key]['message'] = mb_substr(trim($body), 0, 160) ?: null;
    }

    /**
     * True when the provider was called and never answered successfully.
     */
    public function isDown(string $provider): bool
    {
        $stats = $this->providers[$this->normalize($provider)] ?? null;

        return $stats !== null && $stats['attempts'] > 0 && $stats['failures'] >= $stats['attempts'];
    }

    /**
     * Web retrieval is blind: every web-search provider that ran, failed.
     */
    public function isWebSearchDown(): bool
    {
        $called = array_filter(
            self::WEB_SEARCH_PROVIDERS,
            fn(string $provider): bool => ($this->providers[$provider]['attempts'] ?? 0) > 0,
        );

        if ($called === []) {
            return false;
        }

        foreach ($called as $provider) {
            if (! $this->isDown($provider)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Human-facing reason for the blind run, when there is one.
     */
    public function webSearchReason(): ?string
    {
        foreach (self::WEB_SEARCH_PROVIDERS as $provider) {
            if ($this->isDown($provider)) {
                return $this->providers[$provider]['reason'] ?? self::REASON_ERROR;
            }
        }

        return null;
    }

    /**
     * @return array<string, array{attempts: int, failures: int, last_status: int|null, reason: string|null, message: string|null}>
     */
    public function snapshot(): array
    {
        return array_filter(
            $this->providers,
            static fn(array $stats): bool => $stats['failures'] > 0,
        );
    }

    private function classify(int $status, string $body): string
    {
        $haystack = mb_strtolower($body);

        if (str_contains($haystack, 'credit') || $status === 402) {
            return self::REASON_CREDITS;
        }

        if (in_array($status, [401, 403], true)) {
            return self::REASON_UNAUTHORIZED;
        }

        if ($status === 429) {
            return self::REASON_RATE_LIMITED;
        }

        return self::REASON_ERROR;
    }

    private function touch(string $provider): void
    {
        $this->providers[$provider] ??= [
            'attempts' => 0,
            'failures' => 0,
            'last_status' => null,
            'reason' => null,
            'message' => null,
        ];
    }

    private function normalize(string $provider): string
    {
        return mb_strtolower(trim($provider));
    }
}
