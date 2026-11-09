const GENERIC_API_MESSAGES = new Set(["The given data was invalid.", "Request failed."]);

export function formatRateLimitMessage(
  message: string | null | undefined,
  retryAfter?: number | null
): string {
  if (retryAfter && retryAfter > 0) {
    return `Too many login attempts. Please wait ${retryAfter}s and try again.`;
  }

  const trimmed = message?.trim();
  if (trimmed && trimmed !== "Too many requests. Please slow down and try again later.") {
    return trimmed;
  }

  return trimmed || "Too many requests. Please slow down and try again later.";
}

export function resolveApiErrorMessage(
  message: string | null | undefined,
  errors?: Record<string, string[] | string> | null
): string {
  const fromErrors = errors
    ? Object.values(errors)
        .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  if (fromErrors.length > 0) {
    return fromErrors.join(" ");
  }

  const trimmed = message?.trim();
  if (trimmed && !GENERIC_API_MESSAGES.has(trimmed)) {
    return trimmed;
  }

  return trimmed || "Request failed.";
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed."): string {
  if (error instanceof Error) {
    const apiError = error as Error & { errors?: Record<string, string[]> | null };
    if ("errors" in apiError) {
      return resolveApiErrorMessage(apiError.message, apiError.errors ?? null);
    }

    if (error.message.trim()) {
      return error.message;
    }
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: string;
      errors?: Record<string, string[]> | null;
    };

    return resolveApiErrorMessage(candidate.message, candidate.errors);
  }

  return fallback;
}
