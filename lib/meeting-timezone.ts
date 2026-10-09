const FALLBACK_TIMEZONE = "UTC";

export function resolveUserTimezone(): string {
  if (typeof Intl === "undefined") {
    return FALLBACK_TIMEZONE;
  }

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    return timeZone && timeZone.length > 0 ? timeZone : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function isKnownTimezone(timezone: string, options: readonly string[]): boolean {
  const normalized = timezone.trim();
  if (!normalized) return false;
  return options.some((option) => option === normalized);
}

export function resolveMeetingTimezone(
  preferred?: string | null,
  options?: readonly string[],
): string {
  const candidate = preferred?.trim();
  if (candidate) {
    if (!options || options.length === 0 || isKnownTimezone(candidate, options)) {
      return candidate;
    }
  }

  const deviceTimezone = resolveUserTimezone();
  if (!options || options.length === 0 || isKnownTimezone(deviceTimezone, options)) {
    return deviceTimezone;
  }

  if (options.includes(deviceTimezone)) {
    return deviceTimezone;
  }

  return options[0] ?? deviceTimezone;
}
