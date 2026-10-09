<?php

namespace App\Services\Intent;

use App\Models\SocialListeningSetting;

/**
 * Per-run social source health. A missing key or a refused call is recorded
 * here and never fails the rest of the scan.
 */
class SocialSourceHealth
{
    public const MISSING_KEY = 'missing_key';

    public const NEEDS_PAGE_IDS = 'needs_page_ids';

    public const NEEDS_UPGRADE = 'needs_upgrade';

    public const UNAUTHORIZED = 'unauthorized';

    public const RATE_LIMITED = 'rate_limited';

    public const CREDITS = 'credits';

    public const ERROR = 'error';

    public const LIVE = 'live';

    public const DISABLED = 'disabled';

    /** @var array<string, string> */
    public const LABELS = [
        'linkedin_public' => 'LinkedIn',
        'x_mentions' => 'X (search)',
        'reddit' => 'Reddit (search)',
        'meta_pages' => 'Meta (search)',
        'meta_graph_pages' => 'Meta Graph',
        'youtube' => 'YouTube',
        'x_native' => 'X (native)',
        'reddit_native' => 'Reddit (native)',
    ];

    public bool $budgetExhausted = false;

    /** @var array<string, array{status: string, attempts: int, hits: int, last_status: int|null, reason: string|null}> */
    private array $sources = [];

    public function reset(): void
    {
        $this->sources = [];
        $this->budgetExhausted = false;
    }

    public function mark(string $key, string $status, ?string $reason = null): void
    {
        $row = $this->touch($key);
        $row['status'] = $status;
        $row['reason'] = $reason;
        $this->sources[$key] = $row;
    }

    public function recordAttempt(string $key, int $httpStatus, int $hitCount): void
    {
        $row = $this->touch($key);
        $row['attempts']++;
        $row['hits'] += max(0, $hitCount);
        $row['last_status'] = $httpStatus;

        if ($httpStatus >= 200 && $httpStatus < 300) {
            $row['status'] = self::LIVE;
            $row['reason'] = null;
        } elseif (in_array($httpStatus, [401, 403], true)) {
            $row['status'] = $key === 'x_native' ? self::NEEDS_UPGRADE : self::UNAUTHORIZED;
            $row['reason'] = self::UNAUTHORIZED;
        } elseif ($httpStatus === 402) {
            $row['status'] = self::CREDITS;
            $row['reason'] = self::CREDITS;
        } elseif ($httpStatus === 429) {
            $row['status'] = self::RATE_LIMITED;
            $row['reason'] = self::RATE_LIMITED;
        } else {
            $row['status'] = self::ERROR;
            $row['reason'] = self::ERROR;
        }

        $this->sources[$key] = $row;
    }

    /**
     * @return list<array{key: string, label: string, status: string, attempts: int, hits: int, last_status: int|null, reason: string|null}>
     */
    public function snapshot(): array
    {
        $rows = [];
        foreach ($this->sources as $key => $row) {
            $rows[] = [
                'key' => $key,
                'label' => self::LABELS[$key] ?? $key,
                'status' => $row['status'],
                'attempts' => $row['attempts'],
                'hits' => $row['hits'],
                'last_status' => $row['last_status'],
                'reason' => $row['reason'],
            ];
        }

        return $rows;
    }

    /**
     * Key-presence snapshot for the UI, overlaid with the last run's attempt stats.
     *
     * @param  list<array<string, mixed>>|null  $runSources
     * @return list<array{key: string, label: string, status: string, attempts: int, hits: int, last_status: int|null, reason: string|null}>
     */
    public static function describe(SocialListeningSetting $settings, ?array $runSources = null): array
    {
        $enabled = $settings->enabled_sources ?? SocialListeningSetting::DEFAULT_SOURCES;
        $pageIds = array_values(array_filter(array_map(
            static fn ($id) => trim((string) $id),
            $settings->meta_page_ids ?? [],
        )));

        $configured = [
            'linkedin_public' => self::filled('services.serper.api_key'),
            'x_mentions' => self::filled('services.serper.api_key'),
            'reddit' => self::filled('services.serper.api_key'),
            'meta_pages' => self::filled('services.serper.api_key'),
            'meta_graph_pages' => self::filled('services.meta.access_token'),
            'youtube' => self::filled('services.youtube.api_key'),
            'x_native' => self::filled('services.x.bearer_token'),
            'reddit_native' => self::filled('services.reddit.client_id') && self::filled('services.reddit.client_secret'),
        ];

        $auto = ['youtube', 'x_native', 'reddit_native'];
        $byKey = [];
        foreach ($runSources ?? [] as $row) {
            if (is_array($row) && isset($row['key'])) {
                $byKey[(string) $row['key']] = $row;
            }
        }

        $rows = [];
        foreach ($configured as $key => $isConfigured) {
            $listed = in_array($key, $enabled, true) || in_array($key, $auto, true);
            $overlay = $byKey[$key] ?? null;

            if (! $listed) {
                $status = self::DISABLED;
                $reason = null;
            } elseif (! $isConfigured) {
                $status = self::MISSING_KEY;
                $reason = self::MISSING_KEY;
            } elseif ($key === 'meta_graph_pages' && $pageIds === []) {
                $status = self::NEEDS_PAGE_IDS;
                $reason = self::NEEDS_PAGE_IDS;
            } elseif (is_array($overlay) && isset($overlay['status']) && $overlay['status'] !== '') {
                $status = (string) $overlay['status'];
                $reason = isset($overlay['reason']) ? (string) $overlay['reason'] : null;
            } else {
                $status = 'ready';
                $reason = null;
            }

            $rows[] = [
                'key' => $key,
                'label' => self::LABELS[$key] ?? $key,
                'status' => $status,
                'attempts' => (int) ($overlay['attempts'] ?? 0),
                'hits' => (int) ($overlay['hits'] ?? 0),
                'last_status' => isset($overlay['last_status']) ? (int) $overlay['last_status'] : null,
                'reason' => $reason,
            ];
        }

        return $rows;
    }

    private static function filled(string $configKey): bool
    {
        return trim((string) config($configKey)) !== '';
    }

    /**
     * @return array{status: string, attempts: int, hits: int, last_status: int|null, reason: string|null}
     */
    private function touch(string $key): array
    {
        return $this->sources[$key] ?? [
            'status' => self::LIVE,
            'attempts' => 0,
            'hits' => 0,
            'last_status' => null,
            'reason' => null,
        ];
    }
}
