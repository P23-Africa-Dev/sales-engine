import buffer from "@turf/buffer";
import centerOfMass from "@turf/center-of-mass";
import concave from "@turf/concave";
import convex from "@turf/convex";
import simplify from "@turf/simplify";
import { featureCollection, point } from "@turf/helpers";
import type {
  Feature,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

import type { AgentCoverage, CoveragePoint } from "@/lib/api/territories";

export type TerritoryFeatureProperties = {
  userId: number;
  name: string;
  color: string;
  mode: "auto" | "manual";
};

export type TerritoryFeature = Feature<Polygon | MultiPolygon, TerritoryFeatureProperties>;

const BUFFER_KM = 0.4;
const SINGLE_POINT_BUFFER_KM = 0.5;
const CONCAVE_MAX_EDGE_KM = 2.5;
const SIMPLIFY_TOLERANCE = 0.0008;

function toPointFeatures(points: CoveragePoint[]): Feature<Point>[] {
  return points
    .filter(
      (p) =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180
    )
    .map((p) => point([p.longitude, p.latitude], { weight: p.weight }));
}

/**
 * Deduplicate near-identical points (GPS jitter) so hull generation stays fast
 * and stable. Precision of 4 decimal places ≈ 11 m.
 */
function dedupe(points: Feature<Point>[]): Feature<Point>[] {
  const seen = new Set<string>();
  const result: Feature<Point>[] = [];
  for (const feature of points) {
    const [lng, lat] = feature.geometry.coordinates as Position;
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(feature);
  }
  return result;
}

/**
 * Builds a smooth coverage polygon around an agent's coverage points:
 * concave hull → convex fallback → buffered point fallback, then a 400 m
 * buffer for breathing room and a simplify pass for clean edges.
 *
 * Returns null when the agent has no usable points.
 */
export function buildCoveragePolygon(
  coverage: Pick<AgentCoverage, "task_points" | "trail_points">
): Feature<Polygon | MultiPolygon> | null {
  const points = dedupe(
    toPointFeatures([...coverage.task_points, ...coverage.trail_points])
  );

  if (points.length === 0) return null;

  let hull: Feature<Polygon | MultiPolygon> | null = null;

  if (points.length >= 4) {
    try {
      hull = concave(featureCollection(points), { maxEdge: CONCAVE_MAX_EDGE_KM, units: "kilometers" });
    } catch {
      hull = null;
    }
  }

  if (!hull && points.length >= 3) {
    hull = convex(featureCollection(points));
  }

  const base: Feature<Polygon | MultiPolygon> | Feature<Point> = hull ?? points[0];
  const buffered = buffer(
    base,
    hull ? BUFFER_KM : SINGLE_POINT_BUFFER_KM,
    { units: "kilometers" }
  );

  if (!buffered) return null;

  try {
    return simplify(buffered as Feature<Polygon | MultiPolygon>, {
      tolerance: SIMPLIFY_TOLERANCE,
      highQuality: true,
    });
  } catch {
    return buffered as Feature<Polygon | MultiPolygon>;
  }
}

/**
 * Label anchor for a territory polygon.
 */
export function territoryLabelPoint(
  feature: Feature<Polygon | MultiPolygon>
): [number, number] | null {
  try {
    const center = centerOfMass(feature);
    const [lng, lat] = center.geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
  } catch {
    return null;
  }
}

export function buildTerritoryFeature(params: {
  userId: number;
  name: string;
  color: string;
  mode: "auto" | "manual";
  manualPolygon: Polygon | null;
  coverage: Pick<AgentCoverage, "task_points" | "trail_points"> | null;
}): TerritoryFeature | null {
  const { userId, name, color, mode, manualPolygon, coverage } = params;

  let geometry: Polygon | MultiPolygon | null = null;

  if (mode === "manual" && manualPolygon) {
    geometry = manualPolygon;
  } else if (coverage) {
    geometry = buildCoveragePolygon(coverage)?.geometry ?? null;
  }

  if (!geometry) return null;

  return {
    type: "Feature",
    geometry,
    properties: { userId, name, color, mode },
  };
}
