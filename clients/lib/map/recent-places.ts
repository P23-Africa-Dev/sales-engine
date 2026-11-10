/**
 * Uber-style recent places: instant local cache + server sync for the logged-in user.
 */

import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type RecentPlace = {
  id?: number;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  provider?: string | null;
  provider_place_id?: string | null;
  last_used_at?: string | null;
};

const LOCAL_KEY = "factory23_place_recents_v1";
const MAX_LOCAL = 15;

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "https://api.thefactory23.com/api/v1"
  );
}

function readLocal(): RecentPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPlace[];
    return Array.isArray(parsed) ? parsed.filter(isValidRecent) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: RecentPlace[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0, MAX_LOCAL)));
  } catch {
    // ignore quota
  }
}

function isValidRecent(item: unknown): item is RecentPlace {
  if (!item || typeof item !== "object") return false;
  const row = item as RecentPlace;
  return (
    typeof row.name === "string" &&
    row.name.trim() !== "" &&
    typeof row.latitude === "number" &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude)
  );
}

/** Instant paint — no network. */
export function getLocalRecentPlaces(): RecentPlace[] {
  return readLocal();
}

export function saveLocalRecentPlace(place: RecentPlace): RecentPlace[] {
  const next = [
    place,
    ...readLocal().filter((r) => {
      if (place.provider_place_id && r.provider_place_id) {
        return !(r.provider === place.provider && r.provider_place_id === place.provider_place_id);
      }
      return !(
        Math.abs(r.latitude - place.latitude) < 1e-4 &&
        Math.abs(r.longitude - place.longitude) < 1e-4
      );
    }),
  ].slice(0, MAX_LOCAL);
  writeLocal(next);
  return next;
}

export async function fetchRecentPlaces(signal?: AbortSignal): Promise<RecentPlace[]> {
  const token = getAuthTokenFromDocument();
  if (!token) return readLocal();

  try {
    const response = await fetch(`${apiBase()}/places/recents?limit=15&source=dashboard`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
    if (!response.ok) return readLocal();
    const payload = (await response.json()) as { data?: RecentPlace[] };
    const remote = Array.isArray(payload.data) ? payload.data.filter(isValidRecent) : [];
    if (remote.length > 0) {
      writeLocal(remote);
      return remote;
    }
    return readLocal();
  } catch {
    return readLocal();
  }
}

export async function rememberRecentPlace(place: RecentPlace): Promise<void> {
  saveLocalRecentPlace(place);

  const token = getAuthTokenFromDocument();
  if (!token) return;

  try {
    await fetch(`${apiBase()}/places/recents`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: place.name,
        address: place.address ?? null,
        latitude: place.latitude,
        longitude: place.longitude,
        provider: place.provider ?? null,
        provider_place_id: place.provider_place_id ?? null,
        source: "dashboard",
      }),
    });
  } catch {
    // Local already saved — sync can retry next select.
  }
}

export function recentToSuggestionLike(place: RecentPlace, sessionToken: string) {
  return {
    provider: place.provider || "recent",
    id: place.provider_place_id || `recent:${place.latitude},${place.longitude}`,
    name: place.name,
    placeFormatted: place.address || place.name,
    category: null as string | null,
    sessionToken,
    fullAddress: place.address || place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}
