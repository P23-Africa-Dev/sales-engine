"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { PoiResult } from "@/lib/map/overpass-search";
import {
  canFetchPoisForViewport,
  distanceMeters,
  fetchPlacesInViewport,
  POI_MIN_ZOOM,
  POI_MOVE_THRESHOLD_M,
  POI_REFRESH_DEBOUNCE_MS,
  POI_TILE_CACHE_TTL_MS,
  poiTileKey,
  type ViewportBounds,
} from "@/lib/map/poi-viewport";

type PoiTile = { pois: PoiResult[]; ts: number };

function readViewportBounds(map: mapboxgl.Map): ViewportBounds | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

export function useGooglePoiViewport(
  map: mapboxgl.Map | null,
  mapReady: boolean,
  enabled: boolean,
) {
  const [pois, setPois] = useState<PoiResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<PoiResult | null>(null);
  const [zoomTooLow, setZoomTooLow] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-instance client cache: revisiting a recently-seen tile costs nothing.
  const cacheRef = useRef<Map<string, PoiTile>>(new Map());
  const lastFetchRef = useRef<{ lat: number; lng: number; zoomBucket: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !map) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const bounds = readViewportBounds(map);
    const zoom = map.getZoom();
    if (!bounds) return;

    if (!canFetchPoisForViewport(zoom, bounds)) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPois([]);
      setBusy(false);
      setZoomTooLow(zoom < POI_MIN_ZOOM);
      setError(null);
      return;
    }

    setZoomTooLow(false);

    const centerLat = (bounds.north + bounds.south) / 2;
    const centerLng = (bounds.east + bounds.west) / 2;
    const zoomBucket = Math.floor(zoom);
    const tileKey = poiTileKey(centerLat, centerLng, zoom);
    const now = Date.now();

    // 1) Client cache hit — serve instantly, no Google call, no cost.
    const cached = cacheRef.current.get(tileKey);
    if (cached && now - cached.ts < POI_TILE_CACHE_TTL_MS) {
      abortRef.current?.abort();
      abortRef.current = null;
      setPois(cached.pois);
      setBusy(false);
      setError(null);
      lastFetchRef.current = { lat: centerLat, lng: centerLng, zoomBucket };
      return;
    }

    // 2) Tiny nudge (same zoom, moved less than the threshold) — keep current pins.
    const last = lastFetchRef.current;
    if (
      last &&
      last.zoomBucket === zoomBucket &&
      distanceMeters(last.lat, last.lng, centerLat, centerLng) < POI_MOVE_THRESHOLD_M
    ) {
      return;
    }

    // 3) Cache miss + real movement — one billed Nearby Search.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError(null);

    try {
      const results = await fetchPlacesInViewport(bounds, zoom, controller.signal);
      if (controller.signal.aborted) return;
      setPois(results);
      cacheRef.current.set(tileKey, { pois: results, ts: Date.now() });
      lastFetchRef.current = { lat: centerLat, lng: centerLng, zoomBucket };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load places");
      setPois([]);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [enabled, map]);

  useEffect(() => {
    if (!map || !mapReady || !enabled) {
      queueMicrotask(() => {
        setPois([]);
        setBusy(false);
        setZoomTooLow(false);
      });
      lastFetchRef.current = null;
      return;
    }

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refresh();
      }, POI_REFRESH_DEBOUNCE_MS);
    };

    scheduleRefresh();
    map.on("moveend", scheduleRefresh);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.off("moveend", scheduleRefresh);
      abortRef.current?.abort();
    };
  }, [enabled, map, mapReady, refresh]);

  const selectPoi = useCallback((poi: PoiResult | null) => {
    setSelectedPoi(poi);
    // Lazily enrich with phone + opening hours only when a pin is opened.
    if (!poi || (poi.phone && poi.openingHours)) return;
    void (async () => {
      try {
        const { placesDetails } = await import("@/lib/api/places");
        const envelope = await placesDetails(poi.id, "geoapify");
        const place = envelope.data?.[0];
        const phone = place?.phone ?? undefined;
        const openingHours = place?.opening_hours ?? undefined;
        if (!phone && !openingHours) return;
        const merge = (p: PoiResult): PoiResult => ({
          ...p,
          phone: p.phone ?? phone,
          openingHours: p.openingHours ?? openingHours,
        });
        setSelectedPoi((prev) => (prev && prev.id === poi.id ? merge(prev) : prev));
        setPois((prev) => prev.map((p) => (p.id === poi.id ? merge(p) : p)));
      } catch {
        // best-effort enrichment; ignore failures
      }
    })();
  }, []);

  return {
    pois: enabled ? pois : [],
    busy: enabled ? busy : false,
    error: enabled ? error : null,
    zoomTooLow: enabled ? zoomTooLow : false,
    selectedPoi: enabled ? selectedPoi : null,
    setSelectedPoi: selectPoi,
    refresh,
  };
}
