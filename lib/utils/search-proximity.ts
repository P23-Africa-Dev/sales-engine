/**
 * Session-cached browser geolocation for place-search proximity bias.
 * Avoids re-prompting and keeps autocomplete biased to the user's area.
 */

type Proximity = [number, number]; // [lng, lat]

let cached: { value: Proximity; at: number } | null = null;
let inflight: Promise<Proximity | null> | null = null;

const TTL_MS = 5 * 60_000;

export function getCachedSearchProximity(): Proximity | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) {
    cached = null;
    return null;
  }
  return cached.value;
}

export function setCachedSearchProximity(lng: number, lat: number): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  cached = { value: [lng, lat], at: Date.now() };
}

/**
 * Resolve [lng, lat] for search bias. Uses cache first, then a short
 * geolocation lookup (never throws; returns null if denied/unavailable).
 */
export async function resolveSearchProximity(
  timeoutMs = 2500,
): Promise<Proximity | null> {
  const hit = getCachedSearchProximity();
  if (hit) return hit;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  if (inflight) return inflight;

  inflight = new Promise<Proximity | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const value: Proximity = [pos.coords.longitude, pos.coords.latitude];
          cached = { value, at: Date.now() };
          resolve(value);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  }).finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Kick off geolocation in the background without awaiting (Uber-style non-blocking bias). */
export function warmSearchProximity(): void {
  if (getCachedSearchProximity()) return;
  void resolveSearchProximity();
}
