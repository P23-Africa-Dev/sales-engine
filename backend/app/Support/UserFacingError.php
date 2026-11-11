<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Turns internal failures into words a user can act on. Raw exception text (SQL errors,
 * provider responses, API-key problems, stack details) belongs in the logs, never on screen.
 */
final class UserFacingError
{
    public const GENERIC = 'Something went wrong on our side. Please try again in a moment.';

    public const TIMEOUT = 'This is taking longer than usual. Please try again in a few minutes.';

    public const CANCELLED = 'Stopped before it finished.';

    /**
     * Safe message for a caught exception. Validation-style errors this app raises on purpose
     * (InvalidArgumentException, 4xx HTTP exceptions) are already written for users.
     */
    public static function from(Throwable $error, string $fallback = self::GENERIC, array $context = []): string
    {
        Log::warning('User-facing failure', $context + [
            'exception' => $error::class,
            'error' => $error->getMessage(),
        ]);

        if ($error instanceof InvalidArgumentException && trim($error->getMessage()) !== '') {
            return $error->getMessage();
        }
        if ($error instanceof HttpExceptionInterface && $error->getStatusCode() < 500 && trim($error->getMessage()) !== '') {
            return $error->getMessage();
        }

        return self::fromStored($error->getMessage(), $fallback);
    }

    /**
     * Safe message for an error string already stored on a run (`DiscoveryRun.error`, …).
     */
    public static function fromStored(?string $error, string $fallback = self::GENERIC): ?string
    {
        $error = trim((string) $error);
        if ($error === '') {
            return null;
        }

        $lower = mb_strtolower($error);
        if (str_contains($lower, 'cancel')) {
            return self::CANCELLED;
        }
        if (preg_match('/timed? ?out|taking longer|timeout|attempted too many times|exceeded/u', $lower)) {
            return self::TIMEOUT;
        }

        return $fallback;
    }
}
