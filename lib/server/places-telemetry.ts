/**
 * Lightweight in-process Places telemetry for cost monitoring.
 * Ring buffer + counters — swap for Redis/observability stack in multi-instance deploys.
 */

export type PlacesSku =
  | "autocomplete"
  | "details"
  | "poi-details"
  | "nearby"
  | "mapbox-suggest"
  | "mapbox-retrieve";

export type PlacesTelemetryEvent = {
  at: number;
  provider: "google" | "mapbox" | "cache";
  sku: PlacesSku | string;
  cacheHit: boolean;
  fallbackReason?: string | null;
  queryHash?: string | null;
  ms?: number;
  estimatedUsd?: number;
};

const RING_MAX = 200;
const ring: PlacesTelemetryEvent[] = [];

const counters = {
  mapboxSuggest: 0,
  mapboxRetrieve: 0,
  googleAutocomplete: 0,
  googleNearby: 0,
  googleDetails: 0,
  googlePoiDetails: 0,
  cacheHits: 0,
  googleFallbacks: 0,
  duplicatesPrevented: 0,
  estimatedUsdToday: 0,
  dayKey: currentDayKey(),
};

function currentDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollDay(): void {
  const day = currentDayKey();
  if (day !== counters.dayKey) {
    counters.dayKey = day;
    counters.estimatedUsdToday = 0;
    counters.mapboxSuggest = 0;
    counters.mapboxRetrieve = 0;
    counters.googleAutocomplete = 0;
    counters.googleNearby = 0;
    counters.googleDetails = 0;
    counters.googlePoiDetails = 0;
    counters.cacheHits = 0;
    counters.googleFallbacks = 0;
    counters.duplicatesPrevented = 0;
  }
}

/** Rough Places API (New) list prices used for dashboards only — not invoices. */
export function estimateSkuUsd(sku: string): number {
  switch (sku) {
    case "nearby":
      return 0.032; // Nearby Search Pro ~$32/1k
    case "autocomplete":
      return 0.00283;
    case "details":
      return 0.005; // Essentials session-ish estimate
    case "poi-details":
      return 0.017; // richer fields
    default:
      return 0;
  }
}

export function hashQuery(input: string): string {
  const s = input.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `q${(h >>> 0).toString(16)}`;
}

export function recordPlacesTelemetry(event: Omit<PlacesTelemetryEvent, "at"> & { at?: number }): void {
  rollDay();

  const full: PlacesTelemetryEvent = {
    at: event.at ?? Date.now(),
    provider: event.provider,
    sku: event.sku,
    cacheHit: event.cacheHit,
    fallbackReason: event.fallbackReason ?? null,
    queryHash: event.queryHash ?? null,
    ms: event.ms,
    estimatedUsd: event.estimatedUsd,
  };

  ring.push(full);
  if (ring.length > RING_MAX) ring.shift();

  if (full.cacheHit) {
    counters.cacheHits += 1;
  }

  if (full.provider === "google" && !full.cacheHit) {
    const usd = full.estimatedUsd ?? estimateSkuUsd(String(full.sku));
    counters.estimatedUsdToday += usd;
    switch (full.sku) {
      case "autocomplete":
        counters.googleAutocomplete += 1;
        break;
      case "nearby":
        counters.googleNearby += 1;
        break;
      case "details":
        counters.googleDetails += 1;
        break;
      case "poi-details":
        counters.googlePoiDetails += 1;
        break;
      default:
        break;
    }
    if (full.fallbackReason) counters.googleFallbacks += 1;
  }

  if (full.provider === "mapbox") {
    if (full.sku === "mapbox-suggest") counters.mapboxSuggest += 1;
    if (full.sku === "mapbox-retrieve") counters.mapboxRetrieve += 1;
  }

  if (typeof console !== "undefined" && console.info) {
    console.info(
      JSON.stringify({
        type: "places_telemetry",
        ...full,
      }),
    );
  }
}

export function recordDuplicatePrevented(): void {
  rollDay();
  counters.duplicatesPrevented += 1;
}

export function getPlacesMetricsSnapshot() {
  rollDay();
  const googleTotal =
    counters.googleAutocomplete +
    counters.googleNearby +
    counters.googleDetails +
    counters.googlePoiDetails;
  const mapboxTotal = counters.mapboxSuggest + counters.mapboxRetrieve;
  const served = googleTotal + mapboxTotal + counters.cacheHits;
  const cacheHitRatio = served > 0 ? counters.cacheHits / served : 0;
  const fallbackPercentage =
    googleTotal + mapboxTotal > 0 ? counters.googleFallbacks / (googleTotal + mapboxTotal) : 0;

  return {
    day: counters.dayKey,
    counters: { ...counters },
    derived: {
      googleTotal,
      mapboxTotal,
      cacheHitRatio,
      fallbackPercentage,
      estimatedDailyGoogleUsd: counters.estimatedUsdToday,
      estimatedMonthlyGoogleUsd: counters.estimatedUsdToday * 30,
    },
    recent: ring.slice(-50),
  };
}

/** Test helper */
export function __resetPlacesTelemetryForTests(): void {
  ring.length = 0;
  counters.mapboxSuggest = 0;
  counters.mapboxRetrieve = 0;
  counters.googleAutocomplete = 0;
  counters.googleNearby = 0;
  counters.googleDetails = 0;
  counters.googlePoiDetails = 0;
  counters.cacheHits = 0;
  counters.googleFallbacks = 0;
  counters.duplicatesPrevented = 0;
  counters.estimatedUsdToday = 0;
  counters.dayKey = currentDayKey();
}
