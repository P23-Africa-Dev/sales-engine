/**
 * Parse profile URLs from form input or CSV import cell values.
 */
export function parseProfileUrls(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.map((url) => url.trim()).filter(Boolean);
  }

  return value
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function isValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;

  try {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname;
    if (host === "localhost") {
      return true;
    }

    return host.includes(".");
  } catch {
    return false;
  }
}

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function formatProfileUrlsForExport(urls: string[] | null | undefined): string {
  return (urls ?? []).join(", ");
}
