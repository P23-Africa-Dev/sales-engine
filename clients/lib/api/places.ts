"use client";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { ingestCreditMeta } from "@/store/map-credits";

export type PlacesApiPlace = {
  id: string;
  name: string;
  formatted_address: string;
  latitude?: number | null;
  longitude?: number | null;
  provider: string;
  confidence?: number | null;
  categories?: string[];
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  opening_hours?: string | null;
  bbox?: [number, number, number, number] | null;
  sources?: { provider: string; id: string }[];
};

export type PlacesApiMeta = {
  provider?: string | null;
  cache_hit?: boolean;
  confidence?: number;
  fallback_depth?: number;
  providers_tried?: string[];
  latency_ms?: number;
  credits?: {
    balance?: number | null;
    low?: boolean;
    blocked?: boolean;
    metered?: boolean;
  } | null;
  status?: string;
  attribution_visible?: boolean;
  foursquare_premium?: boolean;
  result_limit?: number | null;
  sources_mix?: Record<string, number> | null;
};

type PlacesEnvelope = {
  data: PlacesApiPlace[];
  meta?: PlacesApiMeta;
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

function appendCommon(
  params: URLSearchParams,
  options?: { lat?: number; lng?: number; limit?: number; companyId?: number | string },
) {
  if (options?.lat != null && Number.isFinite(options.lat)) params.set("lat", String(options.lat));
  if (options?.lng != null && Number.isFinite(options.lng)) params.set("lng", String(options.lng));
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.companyId != null) params.set("company_id", String(options.companyId));
  // Prefer query param over custom header so browsers don't fail CORS preflight
  // if X-Places-Source isn't yet on the API allow-list.
  params.set("source", "dashboard");
}

async function placesGet(
  path: string,
  signal?: AbortSignal,
): Promise<PlacesEnvelope> {
  // apiRequest does not accept AbortSignal — use fetch with same auth pattern when needed.
  if (signal) {
    const API_BASE =
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
      "https://api.thefactory23.com/api/v1";
    const token = authToken();
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    });
    const payload = (await response.json()) as {
      data?: PlacesApiPlace[];
      meta?: PlacesApiMeta;
      credits?: PlacesApiMeta["credits"];
    };
    if (payload.meta?.credits) ingestCreditMeta(payload.meta.credits);
    if (!response.ok && response.status !== 402) {
      return { data: [], meta: payload.meta };
    }
    return { data: payload.data ?? [], meta: payload.meta };
  }

  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "https://api.thefactory23.com/api/v1";
  const token = authToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = (await response.json()) as {
    data?: PlacesApiPlace[];
    meta?: PlacesApiMeta;
  };
  if (payload.meta?.credits) ingestCreditMeta(payload.meta.credits);
  return { data: payload.data ?? [], meta: payload.meta };
}

export async function placesAutocomplete(
  query: string,
  options?: {
    lat?: number;
    lng?: number;
    limit?: number;
    companyId?: number | string;
    signal?: AbortSignal;
  },
): Promise<PlacesEnvelope> {
  const params = new URLSearchParams({ q: query });
  appendCommon(params, options);
  return placesGet(`/places/autocomplete?${params.toString()}`, options?.signal);
}

export async function placesSearch(
  query: string,
  options?: {
    lat?: number;
    lng?: number;
    limit?: number;
    companyId?: number | string;
    signal?: AbortSignal;
  },
): Promise<PlacesEnvelope> {
  const params = new URLSearchParams({ q: query });
  appendCommon(params, options);
  return placesGet(`/places/search?${params.toString()}`, options?.signal);
}

export async function placesDetails(
  id: string,
  provider: string,
  options?: { companyId?: number | string; signal?: AbortSignal },
): Promise<PlacesEnvelope> {
  const params = new URLSearchParams({ id, provider });
  if (options?.companyId != null) params.set("company_id", String(options.companyId));
  return placesGet(`/places/details?${params.toString()}`, options?.signal);
}

export async function placesNearby(body: {
  lat: number;
  lng: number;
  radius_m?: number;
  categories?: string[];
  limit?: number;
  companyId?: number | string;
  signal?: AbortSignal;
}): Promise<PlacesEnvelope> {
  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "https://api.thefactory23.com/api/v1";
  const token = authToken();
  const response = await fetch(`${API_BASE}/places/nearby`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      lat: body.lat,
      lng: body.lng,
      radius_m: body.radius_m,
      categories: body.categories,
      limit: body.limit,
      source: "dashboard",
      ...(body.companyId != null ? { company_id: body.companyId } : {}),
    }),
    signal: body.signal,
  });
  const payload = (await response.json()) as {
    data?: PlacesApiPlace[];
    meta?: PlacesApiMeta;
  };
  if (payload.meta?.credits) ingestCreditMeta(payload.meta.credits);
  return { data: payload.data ?? [], meta: payload.meta };
}

export async function placesGeocode(query: string): Promise<PlacesEnvelope> {
  const params = new URLSearchParams({ q: query });
  return placesGet(`/places/geocode?${params.toString()}`);
}

export async function placesReverse(lat: number, lng: number): Promise<PlacesEnvelope> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return placesGet(`/places/reverse?${params.toString()}`);
}
