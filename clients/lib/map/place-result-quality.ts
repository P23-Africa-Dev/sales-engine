/**
 * Result-quality evaluation for Mapbox-primary place search / POI waterfalls.
 * Google Places is only invoked when Mapbox (or Overpass) fails these thresholds.
 */

export type SuggestQualityInput = {
  name: string;
  placeFormatted: string;
  fullAddress?: string | null;
  featureType?: string;
};

export type SuggestQualityOptions = {
  /** Original user query (used for address-like heuristics). */
  query?: string;
  /** Minimum acceptable suggestions (default 1). */
  minCount?: number;
};

export type PoiQualityOptions = {
  /** Minimum POIs with valid coordinates (default 3). */
  minCount?: number;
};

const ADDRESS_LIKE =
  /\d+|street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|drive|dr\.|boulevard|blvd|way|close|court|ct\.|place|pl\./i;

/**
 * Returns true when Mapbox autocomplete suggestions are good enough to skip Google.
 */
export function areSuggestResultsAcceptable(
  results: SuggestQualityInput[],
  options: SuggestQualityOptions = {},
): boolean {
  const minCount = options.minCount ?? 1;
  if (results.length < minCount) return false;

  const usable = results.filter((r) => {
    const name = r.name?.trim() ?? "";
    const formatted = (r.placeFormatted || r.fullAddress || "").trim();
    return name.length > 0 && formatted.length > 0;
  });

  if (usable.length < minCount) return false;

  const query = options.query?.trim() ?? "";
  if (query && ADDRESS_LIKE.test(query)) {
    // Prefer address/street/poi for address-like queries; still accept place/locality
    // when at least one result has a substantive formatted address.
    const hasAddressish = usable.some((r) => {
      const ft = (r.featureType ?? "").toLowerCase();
      if (ft === "address" || ft === "street" || ft === "poi") return true;
      const formatted = (r.placeFormatted || r.fullAddress || "").trim();
      return formatted.length >= 8 && /[,\d]/.test(formatted);
    });
    if (!hasAddressish) return false;
  }

  return true;
}

/**
 * Returns true when area/viewport POI results are good enough to skip Google Nearby.
 */
export function arePoiResultsAcceptable(
  results: Array<{ lat?: number; lng?: number; name?: string }>,
  options: PoiQualityOptions = {},
): boolean {
  const minCount = options.minCount ?? 3;
  const usable = results.filter(
    (r) =>
      typeof r.lat === "number" &&
      typeof r.lng === "number" &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng) &&
      Boolean(r.name?.trim()),
  );
  return usable.length >= minCount;
}

/** Emergency override: force Google-primary waterfall (client + server). */
export function isForceGooglePrimary(): boolean {
  if (typeof process === "undefined") return false;
  const raw =
    process.env.NEXT_PUBLIC_PLACES_FORCE_GOOGLE_PRIMARY?.trim() ||
    process.env.PLACES_FORCE_GOOGLE_PRIMARY?.trim() ||
    "";
  return raw === "true" || raw === "1";
}
