import type { LocationContext } from "@/lib/map/location-search";
import {
  fetchBusinessesInBbox,
  fetchBusinessesNearPoint,
  isBboxTooLarge,
  resolvePoiStyle,
  type PoiResult,
} from "@/lib/map/overpass-search";
import { placesNearby } from "@/lib/api/places";
import { ingestCreditMeta } from "@/store/map-credits";

function deriveRadiusM(ctx: LocationContext): number {
  if (ctx.bbox) {
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    const latMid = (minLat + maxLat) / 2;
    const lngKm = (maxLng - minLng) * 111 * Math.cos((latMid * Math.PI) / 180);
    const latKm = (maxLat - minLat) * 111;
    const radius = (Math.max(lngKm, latKm) * 1000) / 2;
    return Math.min(Math.max(radius, 500), 3000);
  }
  return Math.min(ctx.radiusKm * 1000, 3000);
}

function isOverpassFallbackEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_OVERPASS_POI_FALLBACK === "true" ||
    process.env.ENABLE_OVERPASS_POI_FALLBACK === "true"
  );
}

/**
 * Area POI search via Laravel Places orchestrator
 * (Geoapify → Foursquare → Google). Optional Overpass only if orchestrator empty.
 */
export async function fetchPlacesInArea(
  ctx: LocationContext,
  options?: {
    skipGoogleNearby?: boolean;
    forceGoogleNearby?: boolean;
    signal?: AbortSignal;
  },
): Promise<PoiResult[]> {
  void options;
  if (ctx.bbox && isBboxTooLarge(ctx.bbox)) return [];

  try {
    const envelope = await placesNearby({
      lat: ctx.center[1],
      lng: ctx.center[0],
      radius_m: deriveRadiusM(ctx),
      limit: 40,
      signal: options?.signal,
    });

    if (envelope.meta?.credits) {
      ingestCreditMeta(envelope.meta.credits);
    }

    const mapped: PoiResult[] = (envelope.data ?? [])
      .filter(
        (p) =>
          typeof p.latitude === "number" &&
          typeof p.longitude === "number" &&
          Number.isFinite(p.latitude) &&
          Number.isFinite(p.longitude),
      )
      .map((p) => {
        const category = p.categories?.[0] ?? "business";
        const style = resolvePoiStyle(category);
        return {
          id: p.id,
          lat: p.latitude as number,
          lng: p.longitude as number,
          name: p.name,
          category,
          categoryLabel: style.label,
          categoryColor: style.color,
          address: p.formatted_address || undefined,
          phone: p.phone ?? undefined,
          openingHours: p.opening_hours ?? undefined,
        };
      });

    if (mapped.length > 0) return mapped;
  } catch {
    // fall through to Overpass
  }

  if (isOverpassFallbackEnabled()) {
    if (ctx.bbox) return fetchBusinessesInBbox(ctx.bbox);
    return fetchBusinessesNearPoint(ctx.center[1], ctx.center[0]);
  }

  return [];
}

/** @deprecated Use fetchPlacesInArea — Mapbox keyword sweep removed. */
export async function fetchMapboxPoiFallback(ctx: LocationContext): Promise<PoiResult[]> {
  return fetchPlacesInArea(ctx, { skipGoogleNearby: true });
}
