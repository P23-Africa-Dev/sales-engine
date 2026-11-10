import type { MapboxProfile } from "@/lib/tracking/directions";

const MATCHING_BASE = "https://api.mapbox.com/matching/v5/mapbox";
const CACHE_TTL_MS = 60_000;
const MAX_POINTS = 100;
const ROUTE_CACHE = new Map<string, { coords: [number, number][]; fetchedAt: number }>();
const INFLIGHT = new Map<string, Promise<[number, number][] | null>>();

function roundCoord(n: number): string {
  return n.toFixed(5);
}

function cacheKey(coords: [number, number][], profile: string): string {
  return `${profile}:${coords.map(([lng, lat]) => `${roundCoord(lng)},${roundCoord(lat)}`).join(";")}`;
}

/**
 * Snap a GPS breadcrumb trail to roads via Mapbox Map Matching.
 * Returns raw `coords` when matching is impossible or the API fails.
 */
export async function fetchMapMatchingRoute(
  coords: [number, number][],
  accessToken: string,
  profile: Extract<MapboxProfile, "driving" | "walking" | "cycling"> = "driving",
): Promise<[number, number][]> {
  const cleaned = coords.filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat),
  );

  if (cleaned.length < 2 || !accessToken) {
    return cleaned;
  }

  const windowed = cleaned.length > MAX_POINTS ? cleaned.slice(-MAX_POINTS) : cleaned;
  const key = cacheKey(windowed, profile);
  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.coords;
  }

  const inflight = INFLIGHT.get(key);
  if (inflight) {
    const result = await inflight;
    return result ?? windowed;
  }

  const promise = (async (): Promise<[number, number][] | null> => {
    try {
      const path = windowed.map(([lng, lat]) => `${lng},${lat}`).join(";");
      const url =
        `${MATCHING_BASE}/${profile}/${path}` +
        `?geometries=geojson&overview=full&tidy=true&access_token=${accessToken}`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data = (await res.json()) as {
        matchings?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
      };
      const matched = data?.matchings?.[0]?.geometry?.coordinates;
      if (!matched?.length) return null;

      const snapped = matched as [number, number][];
      ROUTE_CACHE.set(key, { coords: snapped, fetchedAt: Date.now() });
      return snapped;
    } catch {
      return null;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  const matched = await promise;
  return matched ?? windowed;
}

export function clearMapMatchingCache(): void {
  ROUTE_CACHE.clear();
  INFLIGHT.clear();
}
