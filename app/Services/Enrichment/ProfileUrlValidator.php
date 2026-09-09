<?php

namespace App\Services\Enrichment;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Validates "View profile" URLs so users are not sent to 404 pages.
 *
 * Serper-hit URLs are trusted (Google-indexed). GLM-invented URLs are probed.
 */
class ProfileUrlValidator
{
    public const MAX_PROBES_PER_RUN = 15;

    /** @var array<string, bool> */
    private array $cache = [];

    private int $probesThisRun = 0;

    public function resetBudget(): void
    {
        $this->cache = [];
        $this->probesThisRun = 0;
    }

    /**
     * @param  list<string>  $urls
     * @param  list<string>  $trustedUrls  URLs that came from Serper hits (skip probe)
     * @return list<string>
     */
    public function filterValid(array $urls, array $trustedUrls = []): array
    {
        $trusted = [];
        foreach ($trustedUrls as $url) {
            $normalized = $this->normalize($url);
            if ($normalized !== '') {
                $trusted[$normalized] = true;
            }
        }

        $valid = [];
        $seen = [];

        foreach ($urls as $url) {
            if (! is_string($url)) {
                continue;
            }

            $trimmed = trim($url);
            $normalized = $this->normalize($trimmed);
            if ($normalized === '' || isset($seen[$normalized])) {
                continue;
            }
            $seen[$normalized] = true;

            if (! $this->isWellFormedUrl($trimmed)) {
                continue;
            }

            if (isset($trusted[$normalized])) {
                $valid[] = $trimmed;
                $this->cache[$normalized] = true;

                continue;
            }

            if ($this->isReachable($trimmed)) {
                $valid[] = $trimmed;
            }
        }

        return array_values($valid);
    }

    public function isReachable(string $url): bool
    {
        $normalized = $this->normalize($url);
        if ($normalized === '') {
            return false;
        }

        if (array_key_exists($normalized, $this->cache)) {
            return $this->cache[$normalized];
        }

        if (! $this->isWellFormedUrl($url)) {
            return $this->cache[$normalized] = false;
        }

        if ($this->probesThisRun >= self::MAX_PROBES_PER_RUN) {
            // Budget exhausted: keep format-valid LinkedIn /in/ slugs only.
            return $this->cache[$normalized] = $this->looksLikeLinkedInProfile($url);
        }

        $this->probesThisRun++;

        try {
            $response = Http::timeout(4)
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; FactorySalesEngine/1.0)',
                    'Accept' => 'text/html,application/xhtml+xml',
                ])
                ->withOptions(['allow_redirects' => true])
                ->get($url);

            $status = $response->status();

            // Explicit not-found → drop.
            if (in_array($status, [404, 410], true)) {
                return $this->cache[$normalized] = false;
            }

            // Success, redirects already followed, method-not-allowed, or LinkedIn anti-bot (999).
            if ($status < 400 || in_array($status, [405, 999], true)) {
                return $this->cache[$normalized] = true;
            }

            // Other 4xx/5xx: keep only LinkedIn profile-shaped URLs.
            return $this->cache[$normalized] = $this->looksLikeLinkedInProfile($url);
        } catch (\Throwable $e) {
            Log::debug('Profile URL probe failed', ['url' => $url, 'error' => $e->getMessage()]);

            // Timeout / network error: keep LinkedIn /in/ format, drop everything else.
            return $this->cache[$normalized] = $this->looksLikeLinkedInProfile($url);
        }
    }

    private function normalize(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }

        return mb_strtolower(rtrim($url, '/'));
    }

    private function isWellFormedUrl(string $url): bool
    {
        if (! filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }

        $scheme = mb_strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, ['http', 'https'], true);
    }

    private function looksLikeLinkedInProfile(string $url): bool
    {
        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) parse_url($url, PHP_URL_PATH);

        if (! str_contains($host, 'linkedin.com')) {
            return false;
        }

        return (bool) preg_match('~/in/[A-Za-z0-9\\-_%]+/?$~', $path);
    }
}
