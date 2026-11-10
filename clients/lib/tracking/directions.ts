/**
 * Mapbox Directions API utility for fetching road-following routes.
 * Supports all four Mapbox routing profiles and returns accurate
 * API-sourced duration and distance alongside the route geometry.
 */

export type MapboxProfile = 'driving-traffic' | 'driving' | 'cycling' | 'walking';

export type DirectionsResult = {
  coords: [number, number][];
  duration: number; // seconds (from Mapbox API)
  distance: number; // meters  (from Mapbox API)
};

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox';
const ROUTE_CACHE = new Map<string, { result: DirectionsResult; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const INFLIGHT = new Map<string, Promise<DirectionsResult | null>>();

function cacheKey(
  origin: [number, number],
  destination: [number, number],
  profile: MapboxProfile,
): string {
  // Round to 5 decimal places (~1 m precision) to absorb GPS jitter
  const oLng = origin[0].toFixed(5);
  const oLat = origin[1].toFixed(5);
  const dLng = destination[0].toFixed(5);
  const dLat = destination[1].toFixed(5);
  return `${profile}:${oLng},${oLat}→${dLng},${dLat}`;
}

/**
 * Fetch a road-following route using the Mapbox Directions API.
 *
 * Returns geometry coordinates plus the API's accurate duration (seconds)
 * and distance (meters). Results are cached per profile for 5 minutes.
 *
 * Defaults to `driving-traffic` for the most accurate car ETAs with
 * real-time congestion data.
 */
export async function fetchDirectionsRoute(
  origin: [number, number],
  destination: [number, number],
  accessToken: string,
  profile: MapboxProfile = 'driving-traffic',
): Promise<DirectionsResult | null> {
  const key = cacheKey(origin, destination, profile);

  const cached = ROUTE_CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const inflight = INFLIGHT.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<DirectionsResult | null> => {
    try {
      const url =
        `${DIRECTIONS_BASE}/${profile}/` +
        `${origin[0]},${origin[1]};${destination[0]},${destination[1]}` +
        `?geometries=geojson&overview=full&access_token=${accessToken}`;

      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[directions] HTTP ${res.status} — profile: ${profile}`);
        return null;
      }

      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) return null;

      const result: DirectionsResult = {
        coords: route.geometry.coordinates as [number, number][],
        duration: route.duration as number, // seconds
        distance: route.distance as number, // meters
      };

      ROUTE_CACHE.set(key, { result, fetchedAt: Date.now() });
      return result;
    } catch (err) {
      console.warn('[directions] fetch failed:', err);
      return null;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}

/** Manually clear the directions route cache (e.g. on unmount). */
export function clearDirectionsCache(): void {
  ROUTE_CACHE.clear();
  INFLIGHT.clear();
}
