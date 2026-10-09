import {
  placesAutocomplete,
  placesDetails,
  type PlacesApiPlace,
} from "@/lib/api/places";
import type { PlaceSourceRef } from "@/lib/utils/place-attribution";

/**
 * Unified place search via Laravel Places orchestrator
 * (Geoapify ∥ Foursquare, Google backstop). Mapbox is not used for search.
 */

const CLIENT_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_MAX = 100;
const DEFAULT_SUGGEST_LIMIT = 12;

type CacheEntry = { value: PlaceSuggestion[]; expiresAt: number };
const suggestCache = new Map<string, CacheEntry>();
const suggestInflight = new Map<string, Promise<PlaceSuggestion[]>>();

/** Last known admin toggle from autocomplete meta (clients hide badges when false). */
let lastAttributionVisible = true;

export function getPlacesAttributionVisible(): boolean {
  return lastAttributionVisible;
}

export type PlaceSuggestion = {
  provider: string;
  id: string;
  name: string;
  placeFormatted: string;
  category: string | null;
  sessionToken: string;
  fullAddress?: string | null;
  featureType?: string;
  maki?: string | null;
  confidence?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  sources?: PlaceSourceRef[];
  attributionVisible?: boolean;
};

export type RetrievedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  provider: string;
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function suggestCacheKey(
  query: string,
  options: { proximity?: [number, number]; limit?: number },
): string {
  const prox =
    options.proximity &&
    Number.isFinite(options.proximity[0]) &&
    Number.isFinite(options.proximity[1])
      ? `${options.proximity[0].toFixed(3)},${options.proximity[1].toFixed(3)}`
      : "_";
  return [query.toLowerCase(), prox, String(options.limit ?? DEFAULT_SUGGEST_LIMIT)].join("|");
}

function getCachedSuggestions(key: string): PlaceSuggestion[] | null {
  const entry = suggestCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    suggestCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedSuggestions(key: string, value: PlaceSuggestion[]): void {
  if (suggestCache.size >= CLIENT_CACHE_MAX) {
    const first = suggestCache.keys().next().value;
    if (first) suggestCache.delete(first);
  }
  suggestCache.set(key, { value, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

export function __resetPlaceSearchCachesForTests(): void {
  suggestCache.clear();
  suggestInflight.clear();
  lastAttributionVisible = true;
}

function mapSuggestion(
  item: PlacesApiPlace,
  sessionToken: string,
  attributionVisible: boolean,
): PlaceSuggestion {
  const sources =
    Array.isArray(item.sources) && item.sources.length > 0
      ? item.sources
          .filter((s) => s && typeof s.provider === "string" && typeof s.id === "string")
          .map((s) => ({ provider: s.provider, id: s.id }))
      : [{ provider: item.provider || "unknown", id: item.id }];

  return {
    provider: item.provider || "unknown",
    id: item.id,
    name: item.name?.trim() || "Place",
    placeFormatted: item.formatted_address?.trim() ?? "",
    category: item.categories?.[0] ?? null,
    sessionToken,
    fullAddress: item.formatted_address?.trim() || null,
    confidence: item.confidence ?? null,
    latitude: typeof item.latitude === "number" ? item.latitude : null,
    longitude: typeof item.longitude === "number" ? item.longitude : null,
    sources,
    attributionVisible,
  };
}

/**
 * Place suggestions via Laravel (provider-agnostic).
 * `skipGoogle` / `forceGoogle` / `token` retained for API compatibility but ignored —
 * provider selection is server-side.
 */
export async function suggestPlaces(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
    skipGoogle?: boolean;
    forceGoogle?: boolean;
    signal?: AbortSignal;
  },
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = suggestCacheKey(trimmed, options);
  const cached = getCachedSuggestions(key);
  if (cached) {
    return cached.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const existing = suggestInflight.get(key);
  if (existing) {
    const results = await existing;
    return results.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const promise = (async () => {
    try {
      const envelope = await placesAutocomplete(trimmed, {
        lat: options.proximity?.[1],
        lng: options.proximity?.[0],
        limit: options.limit ?? DEFAULT_SUGGEST_LIMIT,
        signal: options.signal,
      });
      const attributionVisible = envelope.meta?.attribution_visible !== false;
      lastAttributionVisible = attributionVisible;
      return (envelope.data ?? []).map((item) =>
        mapSuggestion(item, options.sessionToken, attributionVisible),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return [];
    }
  })()
    .then((results) => {
      // Never cache empty arrays — empty responses are often transient
      // (provider timeout / incomplete waterfall) and must not sticky-block
      // a later successful fan-out for 60s.
      if (results.length > 0) {
        setCachedSuggestions(key, results);
      }
      return results;
    })
    .finally(() => {
      suggestInflight.delete(key);
    });

  suggestInflight.set(key, promise);
  return promise;
}

export async function retrievePlace(
  suggestion: PlaceSuggestion,
): Promise<RetrievedPlace | null> {
  const suggestionHasCoords =
    typeof suggestion.latitude === "number" &&
    typeof suggestion.longitude === "number" &&
    Number.isFinite(suggestion.latitude) &&
    Number.isFinite(suggestion.longitude);

  // Skip details round-trip when autocomplete already returned fly-to-ready coords.
  if (suggestionHasCoords) {
    return {
      placeId: suggestion.id,
      name: suggestion.name || "Location",
      address: suggestion.placeFormatted || suggestion.fullAddress || suggestion.name || "",
      lat: suggestion.latitude as number,
      lng: suggestion.longitude as number,
      bbox: null,
      provider: suggestion.provider,
    };
  }

  try {
    const envelope = await placesDetails(suggestion.id, suggestion.provider);
    const place = envelope.data?.[0];
    if (place && typeof place.latitude === "number" && typeof place.longitude === "number") {
      return {
        placeId: place.id,
        name: place.name?.trim() || suggestion.name || "Location",
        address: place.formatted_address?.trim() || suggestion.placeFormatted || "",
        lat: place.latitude,
        lng: place.longitude,
        bbox: place.bbox ?? null,
        provider: place.provider || suggestion.provider,
      };
    }
  } catch {
    // Details failed and suggestion had no coords.
  }

  return null;
}

/** @deprecated Prefer retrievePlace(suggestion). */
export async function retrievePlaceByMapboxId(
  mapboxId: string,
  sessionToken: string,
): Promise<RetrievedPlace | null> {
  void sessionToken;
  return retrievePlace({
    provider: "geoapify",
    id: mapboxId,
    name: "Location",
    placeFormatted: "",
    category: null,
    sessionToken: createSearchSessionToken(),
  });
}
