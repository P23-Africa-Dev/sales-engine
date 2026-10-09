import buffer from "@turf/buffer";
import { point } from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon } from "geojson";

/** Build a GeoJSON polygon approximating a circle around [lng, lat]. */
export function circlePolygon(
  lng: number,
  lat: number,
  radiusMeters: number,
): Feature<Polygon | MultiPolygon> | null {
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    return null;
  }

  const km = Math.min(Math.max(radiusMeters / 1000, 0.001), 50);
  try {
    return buffer(point([lng, lat]), km, { units: "kilometers", steps: 64 }) ?? null;
  } catch {
    return null;
  }
}

export function circleFeatureCollection(
  circles: Array<{
    lng: number;
    lat: number;
    radiusMeters: number;
    kind: "accuracy" | "geofence";
  }>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const c of circles) {
    const poly = circlePolygon(c.lng, c.lat, c.radiusMeters);
    if (!poly) continue;
    features.push({
      ...poly,
      properties: { ...(poly.properties ?? {}), kind: c.kind },
    });
  }
  return { type: "FeatureCollection", features };
}
