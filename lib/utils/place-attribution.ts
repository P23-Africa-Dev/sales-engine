export type PlaceSourceRef = { provider: string; id: string };

const PROVIDER_LABELS: Record<string, string> = {
  foursquare: "Foursquare",
  geoapify: "Geoapify",
  google: "Google",
};

export function formatPlaceProviderLabel(provider: string): string {
  const key = provider.trim().toLowerCase();
  return PROVIDER_LABELS[key] ?? provider.trim();
}

/**
 * Compact multi-source attribution, e.g. "via Foursquare · Geoapify".
 * Returns null when admin hides badges or there is nothing to show.
 */
export function placeAttributionLabel(
  sources: PlaceSourceRef[] | undefined,
  provider: string | undefined,
  attributionVisible: boolean | undefined = true,
): string | null {
  if (attributionVisible === false) return null;

  const raw =
    sources && sources.length > 0
      ? sources.map((s) => s.provider)
      : provider
        ? [provider]
        : [];

  const unique: string[] = [];
  for (const p of raw) {
    const trimmed = String(p ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (unique.some((u) => u.toLowerCase() === key)) continue;
    unique.push(trimmed);
  }

  if (unique.length === 0) return null;

  return `via ${unique.map(formatPlaceProviderLabel).join(" · ")}`;
}
